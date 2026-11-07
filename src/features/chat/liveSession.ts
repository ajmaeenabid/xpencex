import { auth } from '../../shared/firebase';
import { RECEIVE_RATE, SEND_RATE, ToolCall, bytesToBase64, parseLiveMessage, pcmBase64ToFloat, toPcm16 } from './liveAudio';
import type { Limits } from './limits';

const AI_URL = ((import.meta.env.VITE_AI_WORKER_URL as string | undefined) || '').replace(/\/+$/, '');
const CONNECT_TIMEOUT_MS = 15_000;
const SEND_EVERY_SAMPLES = SEND_RATE / 10; // a tenth of a second at a time

// While developing only, and never what was said: enough to see why a session stopped
const trace = (...details: unknown[]) => { if (import.meta.env.DEV) console.info('[live chat]', ...details); };

// Runs on the phone's sound thread and hands microphone samples to the app
const CAPTURE_WORKLET = `
class Capture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor('xpencex-capture', Capture);
`;

export type LiveState = 'connecting' | 'listening' | 'speaking';
export type LiveEndReason = 'user' | 'time' | 'mic' | 'limit' | 'auth' | 'device' | 'busy' | 'network';

export interface LiveHandlers {
  onState: (state: LiveState) => void;
  // Words so far in the current turn, for the on-screen captions
  onCaption: (who: 'user' | 'assistant', text: string) => void;
  // A finished turn, to add to the conversation
  onTurn: (who: 'user' | 'assistant', text: string) => void;
  onToolCall: (call: ToolCall) => void;
  onLimits: (limits: Limits) => void;
  onEnd: (reason: LiveEndReason) => void;
}

/** One live conversation: microphone to Gemini, and Gemini's voice to the speaker, through our server */
export class LiveSession {
  private ws: WebSocket | null = null;
  private micStream: MediaStream | null = null;
  private micContext: AudioContext | null = null;
  private speaker: AudioContext | null = null;
  private playing = new Set<AudioBufferSourceNode>();
  private playAt = 0;
  private pending: Int16Array[] = [];
  private pendingSamples = 0;
  private heard = '';
  private said = '';
  private ended = false;
  private serverReason: LiveEndReason | null = null;
  private connectTimer: number | null = null;

  constructor(private instruction: string, private on: LiveHandlers) {}

  /** Call straight from a tap: phones only allow sound to start from one */
  start() {
    this.micContext = new AudioContext();
    this.speaker = new AudioContext({ sampleRate: RECEIVE_RATE });
    this.on.onState('connecting');
    this.connect().catch(err => {
      console.error('Live chat could not start', err);
      this.finish(this.serverReason || 'network');
    });
  }

  private async connect() {
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      console.error('No microphone for live chat', err);
      this.finish('mic');
      return;
    }
    if (this.ended) { this.stopMic(); return; }
    trace('microphone allowed');
    // Starts only now: answering the microphone question can take as long as the person likes
    this.connectTimer = window.setTimeout(() => this.finish('network'), CONNECT_TIMEOUT_MS);

    const token = await auth.currentUser?.getIdToken();
    if (!token || !AI_URL) { this.finish('auth'); return; }

    const ws = new WebSocket(`${AI_URL.replace(/^http/, 'ws')}/live`);
    ws.binaryType = 'arraybuffer'; // read straight away, so sound chunks can't change order
    this.ws = ws;
    // The login goes in the first message, not the address, so it never lands in a server log
    ws.onopen = () => ws.send(JSON.stringify({ token, instruction: this.instruction }));
    ws.onmessage = (e) => this.handle(typeof e.data === 'string' ? e.data : new TextDecoder().decode(e.data as ArrayBuffer));
    ws.onerror = () => this.finish(this.serverReason || 'network');
    ws.onclose = () => this.finish(this.serverReason || 'network');
  }

  private handle(raw: string) {
    const event = parseLiveMessage(raw);
    if (event.server) {
      if (event.server.limits) this.on.onLimits(event.server.limits as Limits);
      if (event.server.ended) this.serverReason = 'time';
      if (event.server.error) {
        const known: LiveEndReason[] = ['limit', 'auth', 'device'];
        this.serverReason = known.includes(event.server.error as LiveEndReason) ? event.server.error as LiveEndReason : 'busy';
      }
      return;
    }
    if (event.ready) {
      trace('connected to Gemini');
      if (this.connectTimer) window.clearTimeout(this.connectTimer);
      this.connectTimer = null;
      this.startMic().catch(err => {
        console.error('Could not read the microphone', err);
        this.finish('mic');
      });
      return;
    }
    if (event.closingSoon) this.serverReason = 'busy';
    if (event.heard) {
      if (!this.heard) trace('Gemini heard speech');
      this.heard += event.heard;
      this.on.onCaption('user', this.heard);
    }
    if (event.audio) {
      if (!this.said) trace('Gemini is replying');
      this.flushHeard();
      event.audio.forEach(chunk => this.play(chunk));
      this.on.onState('speaking');
    }
    if (event.said) {
      this.said += event.said;
      this.on.onCaption('assistant', this.said);
    }
    if (event.interrupted) {
      this.stopPlaying();
      this.flushSaid();
      this.on.onState('listening');
    }
    event.toolCalls?.forEach(call => {
      this.flushHeard();
      this.on.onToolCall(call);
    });
    if (event.turnComplete) {
      this.flushHeard();
      this.flushSaid();
      this.afterPlayback(() => this.on.onState('listening'));
    }
  }

  /** Tells the assistant what the app did with its request, so it can carry on talking */
  respondToTool(call: ToolCall, result: string) {
    this.sendJson({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: { result } }] } });
  }

  private sendJson(message: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  private flushHeard() {
    const text = this.heard.trim();
    this.heard = '';
    if (text) this.on.onTurn('user', text);
  }

  private flushSaid() {
    const text = this.said.trim();
    this.said = '';
    if (text) this.on.onTurn('assistant', text);
  }

  private async startMic() {
    const context = this.micContext;
    if (!context || !this.micStream || this.ended) return;
    await context.resume();
    await this.speaker?.resume();
    const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: 'text/javascript' }));
    try {
      await context.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    if (this.ended) return;
    const source = context.createMediaStreamSource(this.micStream);
    const capture = new AudioWorkletNode(context, 'xpencex-capture');
    let loudest = 0;
    let sinceReport = 0;
    capture.port.onmessage = (e: MessageEvent<Float32Array>) => {
      for (const sample of e.data) loudest = Math.max(loudest, Math.abs(sample));
      sinceReport += e.data.length;
      if (sinceReport >= context.sampleRate) {
        // 0 means the microphone is sending silence, such as the wrong device being selected
        trace('microphone level', loudest.toFixed(3), 'speaker', this.speaker?.state);
        loudest = 0;
        sinceReport = 0;
      }
      this.queueMic(toPcm16(e.data, context.sampleRate));
    };
    source.connect(capture);
    // Silent, but some phones only run a sound step that ends at the speaker
    const silent = context.createGain();
    silent.gain.value = 0;
    capture.connect(silent).connect(context.destination);
    this.on.onState('listening');
  }

  private queueMic(samples: Int16Array) {
    this.pending.push(samples);
    this.pendingSamples += samples.length;
    if (this.pendingSamples < SEND_EVERY_SAMPLES) return;
    const joined = new Int16Array(this.pendingSamples);
    let at = 0;
    this.pending.forEach(part => { joined.set(part, at); at += part.length; });
    this.pending = [];
    this.pendingSamples = 0;
    this.sendJson({
      realtimeInput: {
        audio: { data: bytesToBase64(new Uint8Array(joined.buffer)), mimeType: `audio/pcm;rate=${SEND_RATE}` },
      },
    });
  }

  private play(chunk: string) {
    const speaker = this.speaker;
    if (!speaker || this.ended) return;
    const samples = pcmBase64ToFloat(chunk);
    if (!samples.length) return;
    const buffer = speaker.createBuffer(1, samples.length, RECEIVE_RATE);
    buffer.getChannelData(0).set(samples);
    const source = speaker.createBufferSource();
    source.buffer = buffer;
    source.connect(speaker.destination);
    const at = Math.max(speaker.currentTime, this.playAt);
    source.start(at);
    this.playAt = at + buffer.duration;
    this.playing.add(source);
    source.onended = () => this.playing.delete(source);
  }

  private stopPlaying() {
    this.playing.forEach(source => {
      source.onended = null;
      try { source.stop(); } catch { /* already finished */ }
    });
    this.playing.clear();
    this.playAt = 0;
  }

  private afterPlayback(then: () => void) {
    const speaker = this.speaker;
    if (!speaker) return;
    const wait = Math.max(0, this.playAt - speaker.currentTime);
    window.setTimeout(() => { if (!this.ended) then(); }, wait * 1000);
  }

  private stopMic() {
    this.micStream?.getTracks().forEach(track => track.stop());
    this.micStream = null;
  }

  /** Ends the conversation. Safe to call more than once; only the first reason counts. */
  finish(reason: LiveEndReason) {
    if (this.ended) return;
    this.ended = true;
    trace('ended, reason:', reason);
    if (this.connectTimer) window.clearTimeout(this.connectTimer);
    this.flushHeard();
    this.flushSaid();
    this.stopMic();
    this.stopPlaying();
    this.micContext?.close().catch(() => {});
    this.speaker?.close().catch(() => {});
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
    }
    this.on.onEnd(reason);
  }
}

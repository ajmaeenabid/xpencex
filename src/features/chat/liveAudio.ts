// Sound conversion and message reading for live chat. Plain functions, so they can be tested.

export const SEND_RATE = 16000; // what Gemini expects from the microphone
export const RECEIVE_RATE = 24000; // what Gemini sends back

/** Microphone samples (any rate, -1 to 1) to 16-bit sound at 16 kHz, by averaging */
export function toPcm16(input: Float32Array, inputRate: number, outputRate = SEND_RATE): Int16Array {
  const ratio = inputRate / outputRate;
  const output = new Int16Array(Math.floor(input.length / ratio));
  for (let i = 0; i < output.length; i++) {
    const from = Math.floor(i * ratio);
    const to = Math.max(from + 1, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = from; j < to; j++) sum += input[j];
    const sample = Math.max(-1, Math.min(1, sum / (to - from)));
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  // In pieces, because very long argument lists can overflow
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Base64 16-bit sound from Gemini to samples the phone can play */
export function pcmBase64ToFloat(data: string): Float32Array {
  const binary = atob(data);
  const output = new Float32Array(Math.floor(binary.length / 2));
  for (let i = 0; i < output.length; i++) {
    const low = binary.charCodeAt(i * 2);
    const high = binary.charCodeAt(i * 2 + 1);
    const value = (high << 8) | low;
    output[i] = (value >= 0x8000 ? value - 0x10000 : value) / 0x8000;
  }
  return output;
}

export type ToolCall = { id: string; name: string; args: Record<string, unknown> };

export type LiveEvent = {
  server?: { error?: string; ended?: string; limits?: unknown };
  ready?: boolean;
  audio?: string[];
  heard?: string;
  said?: string;
  interrupted?: boolean;
  turnComplete?: boolean;
  toolCalls?: ToolCall[];
  closingSoon?: boolean;
};

/** Reads one message from the server into the parts the app cares about */
export function parseLiveMessage(raw: string): LiveEvent {
  let message: any;
  try { message = JSON.parse(raw); } catch { return {}; }
  if (!message || typeof message !== 'object') return {};
  if (message.xpencex) return { server: message.xpencex };
  const event: LiveEvent = {};
  if (message.setupComplete) event.ready = true;
  if (message.goAway) event.closingSoon = true;
  const content = message.serverContent;
  if (content) {
    const audio = (content.modelTurn?.parts || [])
      .map((p: any) => p.inlineData?.data)
      .filter((d: unknown): d is string => typeof d === 'string');
    if (audio.length) event.audio = audio;
    if (typeof content.inputTranscription?.text === 'string') event.heard = content.inputTranscription.text;
    if (typeof content.outputTranscription?.text === 'string') event.said = content.outputTranscription.text;
    if (content.interrupted) event.interrupted = true;
    if (content.turnComplete) event.turnComplete = true;
  }
  const calls = message.toolCall?.functionCalls;
  if (Array.isArray(calls)) {
    event.toolCalls = calls
      .filter((c: any) => typeof c?.name === 'string')
      .map((c: any) => ({ id: String(c.id ?? ''), name: c.name, args: c.args && typeof c.args === 'object' ? c.args : {} }));
  }
  return event;
}

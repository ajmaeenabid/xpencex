import { useEffect, useRef, useState } from 'react';
import { TFunction, TKey } from '../../shared/i18n';
import { alertDialog } from '../../shared/components/Dialog';
import { MAX_VOICE_SECONDS, MediaKind } from './limits';

/** Called with the finished recording, once the user taps Send */
export type OnRecorded = (base64Audio: string, mimeType: string, voiceDuration: number) => void;

/** Recording a voice message: start, pause, resume, send or cancel, and the clock */
export function useVoiceRecorder({ explainIfBlocked, addMessage, setLimitNote, t }: {
  explainIfBlocked: (kind: MediaKind) => boolean;
  addMessage: (role: 'user' | 'assistant', content: string, type?: 'text' | 'error') => string;
  setLimitNote: (note: TKey | null) => void;
  t: TFunction;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const recordedMsRef = useRef(0); // speaking time before the latest pause
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingStartRef = useRef(0);
  const recordingDurationRef = useRef(0);
  const cancelRecordingRef = useRef(false);

  // Release the microphone and timer if the user leaves the chat mid-recording
  useEffect(() => () => {
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
    cancelRecordingRef.current = true;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }, []);

  const startRecording = async (onRecorded: OnRecorded) => {
    if (explainIfBlocked('voice')) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        if (cancelRecordingRef.current) return;
        const mimeType = mediaRecorder.mimeType.split(';')[0] || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          onRecorded(base64Audio, mimeType, recordingDurationRef.current);
        };
        reader.readAsDataURL(audioBlob);
      };

      cancelRecordingRef.current = false;
      mediaRecorder.start();
      recordedMsRef.current = 0;
      setRecordingSeconds(0);
      setIsPaused(false);
      setIsRecording(true);
      runRecordingTimer();
    } catch (error) {
      console.error("Error starting recording:", error);
      alertDialog(t('chat.micError'));
    }
  };

  // Only speaking time counts, so the clock stands still during a pause
  const spokenMs = () =>
    recordedMsRef.current + (mediaRecorderRef.current?.state === 'recording' ? Date.now() - recordingStartRef.current : 0);

  const runRecordingTimer = () => {
    recordingStartRef.current = Date.now();
    recordingTimerRef.current = window.setInterval(() => {
      const elapsed = Math.floor(spokenMs() / 1000);
      setRecordingSeconds(elapsed);
      if (elapsed >= MAX_VOICE_SECONDS) {
        stopRecording();
        setLimitNote('limit.voice.time');
      }
    }, 250);
  };

  const pauseRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state !== 'recording') return;
    recordedMsRef.current = spokenMs();
    recorder.pause();
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    setIsPaused(true);
  };

  const resumeRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state !== 'paused') return;
    recorder.resume();
    setIsPaused(false);
    runRecordingTimer();
  };

  // Stops the recording and sends it, or discards it when `cancel` is true
  const stopRecording = (cancel = false) => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    const elapsedMs = spokenMs();
    const tooShort = elapsedMs < 800;
    recordingDurationRef.current = Math.max(1, Math.round(elapsedMs / 1000));
    cancelRecordingRef.current = cancel || tooShort;
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    recorder.stop();
    setIsRecording(false);
    setIsPaused(false);
    if (tooShort && !cancel) addMessage('assistant', t('chat.tooShort'), 'error');
  };

  return { isRecording, recordingSeconds, isPaused, startRecording, pauseRecording, resumeRecording, stopRecording };
}

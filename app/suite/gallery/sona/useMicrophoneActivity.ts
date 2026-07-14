'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AUDIO_LEVEL_PUBLISH_INTERVAL_MS,
  normalizeByteRms,
  smoothAudioLevel,
} from '@/lib/audio-level';

export function useMicrophoneActivity() {
  const [active, setActive] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Uint8Array | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastPublishRef = useRef(0);
  const levelRef = useRef(0);

  const releaseResources = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (contextRef.current && contextRef.current.state !== 'closed') contextRef.current.close();
    contextRef.current = null;
    dataRef.current = null;
    lastPublishRef.current = 0;
    levelRef.current = 0;
  }, []);

  const stop = useCallback(() => {
    releaseResources();
    setActive(false);
    setLevel(0);
  }, [releaseResources]);

  const start = useCallback(async () => {
    releaseResources();
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);

      streamRef.current = stream;
      contextRef.current = context;
      sourceRef.current = source;
      analyserRef.current = analyser;
      dataRef.current = new Uint8Array(analyser.frequencyBinCount);
      setActive(true);

      const tick = (timestamp: number) => {
        const data = dataRef.current;
        const currentAnalyser = analyserRef.current;
        if (!data || !currentAnalyser) return;

        if (timestamp - lastPublishRef.current >= AUDIO_LEVEL_PUBLISH_INTERVAL_MS) {
          currentAnalyser.getByteTimeDomainData(data as Uint8Array<ArrayBuffer>);
          const nextLevel = smoothAudioLevel(levelRef.current, normalizeByteRms(data));
          levelRef.current = nextLevel;
          lastPublishRef.current = timestamp;
          setLevel(nextLevel);
        }

        frameRef.current = requestAnimationFrame(tick);
      };

      frameRef.current = requestAnimationFrame(tick);
    } catch {
      releaseResources();
      setActive(false);
      setLevel(0);
      setError('Microphone access is unavailable.');
    }
  }, [releaseResources]);

  const toggle = useCallback(async () => {
    if (active) stop();
    else await start();
  }, [active, start, stop]);

  useEffect(() => releaseResources, [releaseResources]);

  return { active, level, error, toggle };
}

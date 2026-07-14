import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AUDIO_LEVEL_PUBLISH_INTERVAL_MS,
  normalizeByteRms,
  smoothAudioLevel,
} from '@/lib/audio-level';

type OnEndedCallback = () => void;

export function useAudioPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterDataRef = useRef<Uint8Array | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const lastLevelPublishRef = useRef(0);
  const audioLevelRef = useRef(0);
  const onEndedCallbackRef = useRef<OnEndedCallback | null>(null);

  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextClass();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    if (!analyserRef.current) {
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      analyser.connect(audioContextRef.current.destination);
      analyserRef.current = analyser;
      meterDataRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
  }, []);

  const stopLevelMeter = useCallback(() => {
    if (meterFrameRef.current !== null) {
      cancelAnimationFrame(meterFrameRef.current);
      meterFrameRef.current = null;
    }
    audioLevelRef.current = 0;
    lastLevelPublishRef.current = 0;
    setAudioLevel(0);
  }, []);

  const startLevelMeter = useCallback(() => {
    if (meterFrameRef.current !== null) cancelAnimationFrame(meterFrameRef.current);

    const tick = (timestamp: number) => {
      const analyser = analyserRef.current;
      const meterData = meterDataRef.current;

      if (analyser && meterData && timestamp - lastLevelPublishRef.current >= AUDIO_LEVEL_PUBLISH_INTERVAL_MS) {
        analyser.getByteTimeDomainData(meterData as Uint8Array<ArrayBuffer>);
        const nextLevel = smoothAudioLevel(audioLevelRef.current, normalizeByteRms(meterData));
        audioLevelRef.current = nextLevel;
        lastLevelPublishRef.current = timestamp;
        setAudioLevel(nextLevel);
      }

      meterFrameRef.current = requestAnimationFrame(tick);
    };

    meterFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const playAudio = useCallback(async (audioBlob: Blob, onEnded?: OnEndedCallback): Promise<void> => {
    return new Promise(async (resolve, reject) => {
      initAudioContext();
      if (!audioContextRef.current) {
        reject(new Error('AudioContext not available'));
        return;
      }

      onEndedCallbackRef.current = onEnded || null;

      try {
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(analyserRef.current || audioContextRef.current.destination);
        sourceRef.current = source;

        setIsPlaying(true);
        startLevelMeter();

        source.onended = () => {
          setIsPlaying(false);
          stopLevelMeter();
          sourceRef.current = null;
          onEndedCallbackRef.current?.();
          resolve();
        };

        source.start(0);
      } catch (error) {
        console.error('Error playing audio:', error);
        setIsPlaying(false);
        stopLevelMeter();
        reject(error);
      }
    });
  }, [initAudioContext, startLevelMeter, stopLevelMeter]);

  const stopAudio = useCallback(() => {
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        // The source may already have ended.
      }
      sourceRef.current = null;
    }
    stopLevelMeter();
    setIsPlaying(false);
  }, [stopLevelMeter]);

  useEffect(() => {
    return () => {
      if (meterFrameRef.current !== null) cancelAnimationFrame(meterFrameRef.current);
      if (sourceRef.current) {
        sourceRef.current.onended = null;
        try {
          sourceRef.current.stop();
        } catch {
          // The source may already have ended.
        }
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  return {
    isPlaying,
    audioLevel,
    playAudio,
    stopAudio,
  };
}

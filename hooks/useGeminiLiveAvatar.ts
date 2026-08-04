/**
 * useGeminiLiveAvatar — Extended Gemini Live hook for avatar integration
 * 
 * Inherits all behavior from useGeminiLive but instead of playing audio
 * through AudioContext directly, it forwards raw PCM audio chunks to 
 * TalkingHead's speakAudio() for lip-synced playback.
 * 
 * Transcript fragments are accumulated into coherent turns so the on-screen
 * text matches what was actually spoken as complete sentences.
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { authFetch } from '@/lib/auth-fetch';
import {
  AUDIO_LEVEL_PUBLISH_INTERVAL_MS,
  normalizeFloatRms,
  smoothAudioLevel,
} from '@/lib/audio-level';

interface AvatarLiveConfig {
  persona?: string;
  jobDescription?: string;
  interviewStyle?: string;
  avatarMode?: boolean;
}

interface AvatarLiveState {
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isConnecting: boolean;
  userTranscript: string;
  aiTranscript: string;
  fullTranscript: Array<{ role: 'user' | 'ai'; text: string }>;
  error: string | null;
  /**
   * Set when `error` is a plan limit rather than a fault. /api/voice/live-token
   * guards on the shared `gauntlets` cap, so a free user's fourth live session
   * fails with "You used your free interview practice runs" — accurate, but the
   * room only had a status line to print it in, with no way forward.
   */
  errorUpgradeUrl: string | null;
  questionCount: number;
  elapsedSeconds: number;
  inputLevel: number;
  outputLevel: number;
}

type AudioChunkCallback = (base64Pcm: string) => void;
type TurnCompleteCallback = () => void;

const GEMINI_WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained';

export function useGeminiLiveAvatar() {
  const [state, setState] = useState<AvatarLiveState>({
    isConnected: false,
    isListening: false,
    isSpeaking: false,
    isConnecting: false,
    userTranscript: '',
    aiTranscript: '',
    fullTranscript: [],
    error: null,
    errorUpgradeUrl: null,
    questionCount: 0,
    elapsedSeconds: 0,
    inputLevel: 0,
    outputLevel: 0,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextPlayTimeRef = useRef(0);
  const inputLevelRef = useRef(0);
  const outputLevelRef = useRef(0);
  const lastLevelPublishRef = useRef({ inputLevel: 0, outputLevel: 0 });

  // Mic gating — prevents echo feedback loop where AI hears its own audio
  const isSpeakingRef = useRef(false);
  const speakingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Transcript accumulation — merge consecutive fragments from the same role
  const lastTranscriptRoleRef = useRef<'user' | 'ai' | null>(null);

  // Callbacks for avatar integration
  const onAudioChunkRef = useRef<AudioChunkCallback | null>(null);
  const onTurnCompleteRef = useRef<TurnCompleteCallback | null>(null);

  // Register callback: called with raw base64 PCM audio for each chunk
  const setOnAudioChunk = useCallback((cb: AudioChunkCallback | null) => {
    onAudioChunkRef.current = cb;
  }, []);

  // Register callback: called when the AI finishes speaking a turn
  const setOnTurnComplete = useCallback((cb: TurnCompleteCallback | null) => {
    onTurnCompleteRef.current = cb;
  }, []);

  const publishAudioLevel = useCallback((kind: 'inputLevel' | 'outputLevel', rawLevel: number) => {
    const now = performance.now();
    if (now - lastLevelPublishRef.current[kind] < AUDIO_LEVEL_PUBLISH_INTERVAL_MS) return;

    const levelRef = kind === 'inputLevel' ? inputLevelRef : outputLevelRef;
    const nextLevel = smoothAudioLevel(levelRef.current, rawLevel);
    levelRef.current = nextLevel;
    lastLevelPublishRef.current[kind] = now;
    setState(current => ({ ...current, [kind]: nextLevel }));
  }, []);

  useEffect(() => {
    return () => { cleanup(); };
  }, []);

  const connect = useCallback(async (config: AvatarLiveConfig) => {
    inputLevelRef.current = 0;
    outputLevelRef.current = 0;
    setState(s => ({ ...s, isConnecting: true, error: null, errorUpgradeUrl: null, inputLevel: 0, outputLevel: 0 }));

    try {
      const tokenRes = await authFetch('/api/voice/live-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, avatarMode: true }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.json().catch(() => ({} as Record<string, unknown>));
        const failure = new Error(err.error || `Token request failed (${tokenRes.status})`);
        // Carry the route out, so the room can offer one. Only cap/tier answers
        // set it — a mic fault or a dead socket must not suggest paying.
        (failure as Error & { upgradeUrl?: string | null }).upgradeUrl =
          err.limitReached || err.upgrade
            ? (typeof err.upgradeUrl === 'string' ? err.upgradeUrl : '/suite/upgrade')
            : null;
        throw failure;
      }

      const { token } = await tokenRes.json();
      const ws = new WebSocket(`${GEMINI_WS_URL}?access_token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ setup: {} }));
      };

      ws.binaryType = 'arraybuffer';

      ws.onmessage = async (event) => {
        try {
          let text: string;
          if (typeof event.data === 'string') {
            text = event.data;
          } else if (event.data instanceof Blob) {
            text = await event.data.text();
          } else if (event.data instanceof ArrayBuffer) {
            text = new TextDecoder().decode(event.data);
          } else {
            return;
          }
          if (!text || text.length === 0) return;
          const msg = JSON.parse(text);
          handleServerMessage(msg);
        } catch (e) {
          console.warn('[AvatarLive] Failed to parse message:', e);
        }
      };

      ws.onerror = () => {
        setState(s => ({ ...s, error: 'WebSocket connection error', isConnecting: false }));
      };

      ws.onclose = () => {
        cleanup();
        setState(s => ({
          ...s,
          isConnected: false,
          isListening: false,
          isSpeaking: false,
          isConnecting: false,
        }));
      };

    } catch (error: any) {
      setState(s => ({
        ...s,
        isConnecting: false,
        error: error.message || 'Failed to connect',
        errorUpgradeUrl: error?.upgradeUrl ?? null,
      }));
    }
  }, []);

  /**
   * Append a transcript fragment to fullTranscript.
   * If the previous entry is the same role, merge into it (accumulate).
   * If role changed, start a new entry.
   */
  const appendTranscript = useCallback((role: 'user' | 'ai', text: string) => {
    setState(s => {
      const transcript = [...s.fullTranscript];
      const lastEntry = transcript.length > 0 ? transcript[transcript.length - 1] : null;

      if (lastEntry && lastEntry.role === role) {
        // Accumulate into the existing turn
        transcript[transcript.length - 1] = {
          ...lastEntry,
          text: lastEntry.text + text,
        };
      } else {
        // New turn
        transcript.push({ role, text });
      }

      lastTranscriptRoleRef.current = role;

      const isAi = role === 'ai';
      return {
        ...s,
        fullTranscript: transcript,
        userTranscript: isAi ? s.userTranscript : s.userTranscript + text,
        aiTranscript: isAi ? s.aiTranscript + text : s.aiTranscript,
        questionCount: isAi && text.includes('?') ? s.questionCount + 1 : s.questionCount,
      };
    });
  }, []);

  const playAudioChunk = useCallback((base64Data: string) => {
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }

    if (!playbackCtxRef.current || playbackCtxRef.current.state === 'closed') {
      playbackCtxRef.current = new AudioContext({ sampleRate: 24000 });
      nextPlayTimeRef.current = 0;
    }

    const playCtx = playbackCtxRef.current;
    if (playCtx.state === 'suspended') playCtx.resume();

    const buffer = playCtx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const source = playCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(playCtx.destination);

    const now = playCtx.currentTime;
    const startAt = Math.max(now, nextPlayTimeRef.current);
    source.start(startAt);
    nextPlayTimeRef.current = startAt + buffer.duration;
  }, []);

  const handleServerMessage = useCallback((msg: any) => {
    if (msg.setupComplete) {
      setState(s => ({ ...s, isConnected: true, isConnecting: false }));
      startMicCapture();
      // Start elapsed timer
      timerRef.current = setInterval(() => {
        setState(s => ({ ...s, elapsedSeconds: s.elapsedSeconds + 1 }));
      }, 1000);
      return;
    }

    if (msg.serverContent) {
      const sc = msg.serverContent;

      // Forward audio chunks to TalkingHead instead of playing them
      if (sc.modelTurn?.parts) {
        for (const part of sc.modelTurn.parts) {
          if (part.inlineData?.data) {
            publishAudioLevel('outputLevel', getBase64PcmLevel(part.inlineData.data));
            inputLevelRef.current = 0;
            setState(s => ({ ...s, isSpeaking: true, inputLevel: 0 }));
            // Immediately mute mic to prevent echo feedback
            isSpeakingRef.current = true;
            if (speakingDebounceRef.current) {
              clearTimeout(speakingDebounceRef.current);
              speakingDebounceRef.current = null;
            }
            // Forward to avatar for lip-synced playback when available.
            // If no avatar audio consumer is registered, play directly so Avatar Live
            // gracefully falls back to a reliable Taco audio room.
            if (onAudioChunkRef.current) {
              onAudioChunkRef.current(part.inlineData.data);
            } else {
              playAudioChunk(part.inlineData.data);
            }
          }
        }
      }

      if (sc.turnComplete) {
        outputLevelRef.current = 0;
        setState(s => ({ ...s, isSpeaking: false, outputLevel: 0 }));
        // Debounce 500ms before re-enabling mic — catches speaker echo tail
        speakingDebounceRef.current = setTimeout(() => {
          isSpeakingRef.current = false;
          speakingDebounceRef.current = null;
        }, 500);
        // Signal that the AI turn is complete — next transcript from either
        // role should start a new entry
        lastTranscriptRoleRef.current = null;
        onTurnCompleteRef.current?.();
      }

      // Transcriptions — accumulate fragments into coherent turns
      if (sc.inputTranscription?.text) {
        appendTranscript('user', sc.inputTranscription.text);
      }

      if (sc.outputTranscription?.text) {
        appendTranscript('ai', sc.outputTranscription.text);
      }

      if (sc.interrupted) {
        outputLevelRef.current = 0;
        setState(s => ({ ...s, isSpeaking: false, outputLevel: 0 }));
        // AI was interrupted — re-enable mic immediately (user is talking)
        isSpeakingRef.current = false;
        if (speakingDebounceRef.current) {
          clearTimeout(speakingDebounceRef.current);
          speakingDebounceRef.current = null;
        }
        // Reset accumulation so the next fragment starts fresh
        lastTranscriptRoleRef.current = null;
      }
    }
  }, [appendTranscript, playAudioChunk, publishAudioLevel]);

  const startMicCapture = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      const bufferSize = 4096;
      const scriptNode = ctx.createScriptProcessor(bufferSize, 1, 1);
      scriptNodeRef.current = scriptNode;

      scriptNode.onaudioprocess = (e) => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) return;
        // Mic gating: don't send audio while AI is speaking (prevents echo loop)
        if (isSpeakingRef.current) return;
        const input = e.inputBuffer.getChannelData(0);
        publishAudioLevel('inputLevel', normalizeFloatRms(input));
        const pcm16 = float32ToInt16(input);
        const base64 = arrayBufferToBase64(pcm16.buffer as ArrayBuffer);

        wsRef.current.send(JSON.stringify({
          realtimeInput: {
            audio: {
              data: base64,
              mimeType: 'audio/pcm;rate=16000',
            },
          },
        }));
      };

      source.connect(scriptNode);
      scriptNode.connect(ctx.destination);

      setState(s => ({ ...s, isListening: true }));
    } catch {
      inputLevelRef.current = 0;
      setState(s => ({ ...s, error: 'Microphone access denied', inputLevel: 0 }));
    }
  }, [publishAudioLevel]);

  const disconnect = useCallback(() => {
    cleanup();
    // Return the full transcript for grading
    const transcript = state.fullTranscript;
    setState({
      isConnected: false,
      isListening: false,
      isSpeaking: false,
      isConnecting: false,
      userTranscript: '',
      aiTranscript: '',
      fullTranscript: [],
      error: null,
      errorUpgradeUrl: null,
      questionCount: 0,
      elapsedSeconds: 0,
      inputLevel: 0,
      outputLevel: 0,
    });
    return transcript;
  }, [state.fullTranscript]);

  const getTranscript = useCallback(() => {
    return state.fullTranscript;
  }, [state.fullTranscript]);

  const cleanup = useCallback(() => {
    if (speakingDebounceRef.current) {
      clearTimeout(speakingDebounceRef.current);
      speakingDebounceRef.current = null;
    }
    isSpeakingRef.current = false;
    inputLevelRef.current = 0;
    outputLevelRef.current = 0;
    lastLevelPublishRef.current = { inputLevel: 0, outputLevel: 0 };
    lastTranscriptRoleRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (scriptNodeRef.current) {
      scriptNodeRef.current.disconnect();
      scriptNodeRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (playbackCtxRef.current && playbackCtxRef.current.state !== 'closed') {
      playbackCtxRef.current.close();
      playbackCtxRef.current = null;
    }
    nextPlayTimeRef.current = 0;
  }, []);

  const sendText = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text }] }],
          turnComplete: true,
        },
      }));
    }
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    sendText,
    getTranscript,
    setOnAudioChunk,
    setOnTurnComplete,
  };
}

// ── Helpers ──

function float32ToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function getBase64PcmLevel(base64Data: string): number {
  const binary = atob(base64Data);
  const sampleCount = Math.floor(binary.length / 2);
  if (sampleCount === 0) return 0;

  let sumSquares = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const low = binary.charCodeAt(index * 2);
    const high = binary.charCodeAt(index * 2 + 1);
    const unsigned = low | (high << 8);
    const signed = unsigned >= 0x8000 ? unsigned - 0x10000 : unsigned;
    const sample = signed / 32768;
    sumSquares += sample * sample;
  }

  return Math.min(1, Math.sqrt(sumSquares / sampleCount) * 3.4);
}

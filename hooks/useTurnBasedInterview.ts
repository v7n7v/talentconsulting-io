/**
 * useTurnBasedInterview — self-hosted, turn-based replacement for the Gemini Live
 * interview hook.
 *
 * PUBLIC INTERFACE IS A DROP-IN for `useGeminiLiveAvatar`: the same state fields
 * and the same methods (`connect` / `disconnect` / `sendText` / `getTranscript` /
 * `setOnAudioChunk` / `setOnTurnComplete`), so `app/suite/interview-sim/page.tsx`
 * swaps in with a one-line import change and `LiveRoom` / `AvatarCanvas` are
 * untouched.
 *
 * Pipeline per turn: client VAD records the candidate → `/api/interview/turn`
 * (Deepgram STT → Groq LLM → sentence-chunked SuperTonic TTS) → the returned
 * audio segments are played as an ordered queue → the mic re-opens.
 *
 * Barge-in is real: while the interviewer is speaking, the mic keeps metering,
 * and sustained candidate speech FLUSHES the scheduled audio by closing and
 * replacing the playback AudioContext (not merely flipping a flag), then starts
 * capturing the interruption as the next turn.
 *
 * Reused wholesale from the old hook: 16 kHz PCM mic capture, `lib/audio-level`
 * metering, transcript accumulation with '?' question counting, the mic-gate and
 * a 500 ms echo debounce after playback.
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { authFetch } from '@/lib/auth-fetch';
import {
  AUDIO_LEVEL_PUBLISH_INTERVAL_MS,
  normalizeFloatRms,
  smoothAudioLevel,
} from '@/lib/audio-level';

interface InterviewConfig {
  persona?: string;
  jobDescription?: string;
  interviewStyle?: string;
  avatarMode?: boolean;
}

interface InterviewState {
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isConnecting: boolean;
  userTranscript: string;
  aiTranscript: string;
  fullTranscript: Array<{ role: 'user' | 'ai'; text: string }>;
  error: string | null;
  /**
   * Set only when `error` is a plan limit rather than a fault. `/api/interview/session`
   * guards on the shared `gauntlets` cap, so a free user's exhausted runs fail
   * with a limit body carrying `upgradeUrl`. An infra fault (mic, STT/LLM/TTS
   * transport) must NEVER set this — it must not suggest paying.
   */
  errorUpgradeUrl: string | null;
  questionCount: number;
  elapsedSeconds: number;
  inputLevel: number;
  outputLevel: number;
}

type AudioChunkCallback = (base64Pcm: string) => void;
type TurnCompleteCallback = () => void;

type Phase = 'idle' | 'thinking' | 'speaking' | 'debounce' | 'listening';

// ── Client VAD tuning (values are normalized 0..1 from normalizeFloatRms) ──
const CAPTURE_SAMPLE_RATE = 16000;
const CAPTURE_BUFFER_SIZE = 2048; // ~128 ms/frame at 16 kHz
const FRAME_MS = (CAPTURE_BUFFER_SIZE / CAPTURE_SAMPLE_RATE) * 1000;
const SPEECH_LEVEL = 0.08; // candidate is talking
const END_SILENCE_MS = 900; // trailing silence that ends a turn
const MIN_VOICED_MS = 250; // ignore clicks/coughs shorter than this
const MAX_TURN_MS = 30_000; // safety cap on a single answer
const BARGE_LEVEL = 0.12; // higher bar during playback (echo-guarded)
const BARGE_MIN_MS = 350; // sustained speech that interrupts the interviewer
const ECHO_DEBOUNCE_MS = 500; // wait after playback before re-opening the mic
// Client-side backstop on a single turn. The server bounds each stage (STT/LLM/TTS)
// and caps itself at maxDuration=90s, so this sits just above that: a dropped
// connection or stalled body can't leave the room frozen in 'thinking' for the
// full ~300s platform request cap with a misleading 'Connected' badge.
const TURN_TIMEOUT_MS = 100_000;

export function useTurnBasedInterview() {
  const [state, setState] = useState<InterviewState>({
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

  // Capture (mic) graph
  const micStreamRef = useRef<MediaStream | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);

  // Playback graph
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const nextPlayTimeRef = useRef(0);
  const playTokenRef = useRef(0); // bumped to cancel in-flight playback (barge/disconnect)
  const outputMeterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Per-segment transcript-commit timers: each AI sentence is committed at the
  // moment it begins to sound, not up front, so a flush leaves the un-heard tail
  // uncommitted. Cleared on flush/disconnect so a stale timer can't fire late.
  const appendTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Turn / conversation state
  const phaseRef = useRef<Phase>('idle');
  const configRef = useRef<InterviewConfig>({});
  const historyRef = useRef<Array<{ role: 'user' | 'ai'; text: string }>>([]);
  const fullTranscriptRef = useRef<Array<{ role: 'user' | 'ai'; text: string }>>([]);
  const abortRef = useRef<AbortController | null>(null);
  const closedRef = useRef(false);

  // VAD capture accumulator
  const captureRef = useRef<{ chunks: Float32Array[]; speechActive: boolean; voicedMs: number; silenceMs: number; totalMs: number }>(
    { chunks: [], speechActive: false, voicedMs: 0, silenceMs: 0, totalMs: 0 },
  );
  const bargeVoicedMsRef = useRef(0);
  // The frames that constitute an in-progress barge, accumulated during playback so
  // the audio that TRIGGERED the interruption is actually sent to STT — not dropped
  // in favour of a single post-trigger frame paired with an inflated voiced count.
  const bargeChunksRef = useRef<Float32Array[]>([]);

  // Timers + level metering
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputLevelRef = useRef(0);
  const outputLevelRef = useRef(0);
  const lastLevelPublishRef = useRef({ inputLevel: 0, outputLevel: 0 });

  // Avatar-integration callbacks (kept for interface parity with the old hook;
  // turn-based TTS is mp3 segments, not a PCM chunk stream, so onAudioChunk is
  // registered but not driven — the avatar audio path was already dead code).
  const onAudioChunkRef = useRef<AudioChunkCallback | null>(null);
  const onTurnCompleteRef = useRef<TurnCompleteCallback | null>(null);

  const setOnAudioChunk = useCallback((cb: AudioChunkCallback | null) => {
    onAudioChunkRef.current = cb;
  }, []);

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

  const appendTranscript = useCallback((role: 'user' | 'ai', text: string) => {
    const clean = text.trim();
    if (!clean) return;
    // Merge consecutive same-role entries in the LLM history mirror too, so an AI
    // turn committed sentence-by-sentence (see playSegments) collapses to a single
    // assistant message — and a barge-in that stops mid-reply leaves history holding
    // only the sentences actually spoken, keeping the next turn's context truthful.
    const prevHist = historyRef.current;
    const lastHist = prevHist.length > 0 ? prevHist[prevHist.length - 1] : null;
    if (lastHist && lastHist.role === role) {
      historyRef.current = [
        ...prevHist.slice(0, -1),
        { role, text: `${lastHist.text} ${clean}`.trim() },
      ];
    } else {
      historyRef.current = [...prevHist, { role, text: clean }];
    }
    setState(s => {
      const transcript = [...s.fullTranscript];
      const last = transcript.length > 0 ? transcript[transcript.length - 1] : null;
      if (last && last.role === role) {
        transcript[transcript.length - 1] = { ...last, text: `${last.text} ${clean}`.trim() };
      } else {
        transcript.push({ role, text: clean });
      }
      fullTranscriptRef.current = transcript;
      const isAi = role === 'ai';
      return {
        ...s,
        fullTranscript: transcript,
        userTranscript: isAi ? s.userTranscript : `${s.userTranscript} ${clean}`.trim(),
        aiTranscript: isAi ? `${s.aiTranscript} ${clean}`.trim() : s.aiTranscript,
        questionCount: isAi && clean.includes('?') ? s.questionCount + 1 : s.questionCount,
      };
    });
  }, []);

  // ── Playback ─────────────────────────────────────────────────────────────
  const stopOutputMeter = useCallback(() => {
    if (outputMeterRef.current) {
      clearInterval(outputMeterRef.current);
      outputMeterRef.current = null;
    }
    outputLevelRef.current = 0;
    setState(s => (s.outputLevel === 0 ? s : { ...s, outputLevel: 0 }));
  }, []);

  const clearAppendTimers = useCallback(() => {
    for (const t of appendTimersRef.current) clearTimeout(t);
    appendTimersRef.current = [];
  }, []);

  const flushPlayback = useCallback(() => {
    // Bump the token so any in-flight decode/schedule loop bails immediately.
    playTokenRef.current += 1;
    // Drop any not-yet-fired per-segment commits: their audio will never be heard.
    clearAppendTimers();
    stopOutputMeter();
    if (playbackCtxRef.current && playbackCtxRef.current.state !== 'closed') {
      // Closing the context tears down every scheduled BufferSource at once —
      // this is the actual flush, not a muted flag.
      playbackCtxRef.current.close().catch(() => {});
    }
    playbackCtxRef.current = null;
    analyserRef.current = null;
    nextPlayTimeRef.current = 0;
  }, [stopOutputMeter, clearAppendTimers]);

  const ensurePlaybackCtx = useCallback(() => {
    if (!playbackCtxRef.current || playbackCtxRef.current.state === 'closed') {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.connect(ctx.destination);
      playbackCtxRef.current = ctx;
      analyserRef.current = analyser;
      nextPlayTimeRef.current = 0;
    }
    return playbackCtxRef.current;
  }, []);

  const startOutputMeter = useCallback(() => {
    if (outputMeterRef.current) return;
    const analyser = analyserRef.current;
    if (!analyser) return;
    const buffer = new Float32Array(analyser.fftSize);
    outputMeterRef.current = setInterval(() => {
      if (!analyserRef.current) return;
      analyserRef.current.getFloatTimeDomainData(buffer);
      publishAudioLevel('outputLevel', normalizeFloatRms(buffer));
    }, AUDIO_LEVEL_PUBLISH_INTERVAL_MS);
  }, [publishAudioLevel]);

  const beginListening = useCallback(() => {
    if (closedRef.current) return;
    captureRef.current = { chunks: [], speechActive: false, voicedMs: 0, silenceMs: 0, totalMs: 0 };
    bargeVoicedMsRef.current = 0;
    bargeChunksRef.current = [];
    phaseRef.current = 'listening';
    setState(s => ({ ...s, isListening: true, isSpeaking: false }));
  }, []);

  const finishSpeaking = useCallback(() => {
    stopOutputMeter();
    onTurnCompleteRef.current?.();
    if (closedRef.current) return;
    // 500 ms echo debounce: hold the mic gate closed to swallow the speaker tail
    // before re-opening for the candidate's answer.
    phaseRef.current = 'debounce';
    setState(s => ({ ...s, isSpeaking: false }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      beginListening();
    }, ECHO_DEBOUNCE_MS);
  }, [beginListening, stopOutputMeter]);

  const playSegments = useCallback(async (segments: Array<{ audio: string; contentType?: string; text?: string }>) => {
    if (closedRef.current) return;
    if (!segments || segments.length === 0) {
      // Text-only turn (TTS unavailable or failed) — no audio to play.
      finishSpeaking();
      return;
    }

    const token = ++playTokenRef.current;
    const ctx = ensurePlaybackCtx();
    if (!ctx) { finishSpeaking(); return; }
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});

    phaseRef.current = 'speaking';
    bargeVoicedMsRef.current = 0;
    bargeChunksRef.current = [];
    setState(s => ({ ...s, isSpeaking: true, isListening: false }));
    startOutputMeter();
    nextPlayTimeRef.current = Math.max(nextPlayTimeRef.current, ctx.currentTime);

    for (const seg of segments) {
      if (token !== playTokenRef.current || closedRef.current) return; // barged / disconnected
      let buffer: AudioBuffer;
      try {
        buffer = await ctx.decodeAudioData(base64ToArrayBuffer(seg.audio));
      } catch {
        continue; // skip an undecodable segment rather than abort the whole turn
      }
      if (token !== playTokenRef.current || closedRef.current) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(analyserRef.current ?? ctx.destination);
      const startAt = Math.max(ctx.currentTime, nextPlayTimeRef.current);
      src.start(startAt);
      nextPlayTimeRef.current = startAt + buffer.duration;
      // Commit this sentence to the transcript when it actually begins to sound —
      // not up front. A barge-in flushes the queue and clearAppendTimers() drops
      // every pending commit, so the interviewer is credited only with what the
      // candidate heard, and questionCount counts only questions actually asked.
      const segText = typeof seg.text === 'string' ? seg.text.trim() : '';
      if (segText) {
        const delayMs = Math.max(0, (startAt - ctx.currentTime) * 1000);
        const timerToken = token;
        const timer = setTimeout(() => {
          if (timerToken !== playTokenRef.current || closedRef.current) return;
          appendTranscript('ai', segText);
        }, delayMs);
        appendTimersRef.current.push(timer);
      }
    }

    if (token !== playTokenRef.current || closedRef.current) return;
    const remainingMs = Math.max(0, (nextPlayTimeRef.current - ctx.currentTime) * 1000);
    await sleep(remainingMs);
    if (token !== playTokenRef.current || closedRef.current) return;
    finishSpeaking();
  }, [appendTranscript, ensurePlaybackCtx, finishSpeaking, startOutputMeter]);

  // ── Turn request ─────────────────────────────────────────────────────────
  const runTurn = useCallback(async (payload: { kickoff?: boolean; audio?: Blob; text?: string }) => {
    if (closedRef.current) return;
    phaseRef.current = 'thinking';
    setState(s => ({ ...s, isListening: false }));

    const form = new FormData();
    form.append('persona', configRef.current.persona || 'friendly-hr');
    form.append('jobDescription', configRef.current.jobDescription || '');
    form.append('interviewStyle', configRef.current.interviewStyle || 'behavioral');
    form.append('history', JSON.stringify(historyRef.current));
    if (payload.kickoff) form.append('kickoff', 'true');
    if (payload.text) form.append('text', payload.text);
    if (payload.audio) form.append('audio', payload.audio, 'turn.wav');

    const controller = new AbortController();
    abortRef.current = controller;
    // `timedOut` distinguishes our client backstop from a disconnect/barge abort:
    // only a timeout should surface a recoverable fault and re-open the mic.
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, TURN_TIMEOUT_MS);

    try {
      const res = await authFetch('/api/interview/turn', { method: 'POST', body: form, signal: controller.signal });
      if (closedRef.current) return;

      if (!res.ok) {
        const err = await res.json().catch(() => ({} as Record<string, unknown>));
        const upgradeUrl = err.limitReached || err.upgrade
          ? (typeof err.upgradeUrl === 'string' ? err.upgradeUrl : '/suite/upgrade')
          : null;
        // A failed turn is recoverable — surface it and re-open the mic so the
        // candidate can retry. Only a cap/tier body sets errorUpgradeUrl.
        setState(s => ({ ...s, error: String(err.error || `Turn failed (${res.status})`), errorUpgradeUrl: upgradeUrl }));
        if (!upgradeUrl) beginListening();
        return;
      }

      const data = await res.json();
      if (closedRef.current) return;

      // A successful turn clears any stale fault banner left by an earlier
      // recovered turn — otherwise `error` is reset only on connect/disconnect,
      // so one transient fault haunts the amber banner for the whole session.
      setState(s => (s.error ? { ...s, error: null, errorUpgradeUrl: null } : s));

      if (data.noSpeech) {
        beginListening();
        return;
      }

      if (payload.text) appendTranscript('user', payload.text);
      else if (data.userText) appendTranscript('user', data.userText);

      const segments = Array.isArray(data.segments) ? data.segments : [];
      // The AI reply is committed sentence-by-sentence as it is heard, inside
      // playSegments. Commit the whole reply here ONLY when there is no audio to
      // hear (TTS unavailable/failed) — a text-mode degradation that can't be
      // barged, so there is no un-heard tail to over-credit.
      if (segments.length === 0 && typeof data.aiText === 'string' && data.aiText.trim()) {
        appendTranscript('ai', data.aiText);
      }

      await playSegments(segments);
    } catch (error: any) {
      if (closedRef.current) return;
      if (error?.name === 'AbortError') {
        // A disconnect/barge abort is silent; only our own timeout is a fault.
        if (timedOut) {
          setState(s => ({ ...s, error: 'The interviewer took too long to respond. Please try again.', errorUpgradeUrl: null }));
          beginListening();
        }
        return;
      }
      setState(s => ({ ...s, error: error?.message || 'Interview turn failed', errorUpgradeUrl: null }));
      beginListening();
    } finally {
      clearTimeout(timeout);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [appendTranscript, beginListening, playSegments]);

  // ── Mic capture + VAD ──────────────────────────────────────────────────────
  const finalizeUserTurn = useCallback(() => {
    const cap = captureRef.current;
    const chunks = cap.chunks;
    const voiced = cap.voicedMs;
    captureRef.current = { chunks: [], speechActive: false, voicedMs: 0, silenceMs: 0, totalMs: 0 };
    if (voiced < MIN_VOICED_MS || chunks.length === 0) {
      // Too short to be an answer — keep listening.
      phaseRef.current = 'listening';
      return;
    }
    inputLevelRef.current = 0;
    setState(s => ({ ...s, inputLevel: 0 }));
    const wav = encodeWav(chunks, CAPTURE_SAMPLE_RATE);
    void runTurn({ audio: wav });
  }, [runTurn]);

  const onAudioFrame = useCallback((input: Float32Array) => {
    const level = normalizeFloatRms(input);

    if (phaseRef.current === 'listening') {
      publishAudioLevel('inputLevel', level);
      const cap = captureRef.current;
      cap.totalMs += FRAME_MS;
      if (level >= SPEECH_LEVEL) {
        cap.speechActive = true;
        cap.voicedMs += FRAME_MS;
        cap.silenceMs = 0;
        cap.chunks.push(new Float32Array(input));
      } else if (cap.speechActive) {
        cap.silenceMs += FRAME_MS;
        cap.chunks.push(new Float32Array(input)); // keep the trailing tail
        if (cap.silenceMs >= END_SILENCE_MS) {
          finalizeUserTurn();
          return;
        }
      }
      if (cap.totalMs >= MAX_TURN_MS && cap.speechActive) {
        finalizeUserTurn();
      }
      return;
    }

    if (phaseRef.current === 'speaking') {
      // Barge-in detection: sustained candidate speech over the interruption
      // during the interviewer's turn flushes playback and starts a new turn.
      if (level >= BARGE_LEVEL) {
        bargeVoicedMsRef.current += FRAME_MS;
        // Keep the frames that make up the barge so the audio that TRIGGERED the
        // interruption is the audio sent to STT — not dropped for a single frame.
        bargeChunksRef.current.push(new Float32Array(input));
        if (bargeVoicedMsRef.current >= BARGE_MIN_MS) {
          flushPlayback();
          if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
          // Seed the new turn with the interruption already in progress — including
          // its accumulated audio, so MIN_VOICED_MS gates on real captured speech
          // and Deepgram receives the opening words instead of a clipped tail.
          captureRef.current = {
            chunks: bargeChunksRef.current,
            speechActive: true,
            voicedMs: bargeVoicedMsRef.current,
            silenceMs: 0,
            totalMs: bargeVoicedMsRef.current,
          };
          bargeChunksRef.current = [];
          bargeVoicedMsRef.current = 0;
          phaseRef.current = 'listening';
          setState(s => ({ ...s, isSpeaking: false, isListening: true }));
        }
      } else {
        bargeVoicedMsRef.current = Math.max(0, bargeVoicedMsRef.current - FRAME_MS);
        // Leaky bucket: a burst that didn't sustain is discarded, audio and all, so
        // a later real barge never inherits stale frames from a false start.
        if (bargeVoicedMsRef.current === 0 && bargeChunksRef.current.length > 0) {
          bargeChunksRef.current = [];
        }
      }
    }
    // 'thinking' and 'debounce' phases: mic gated — ignore input entirely.
  }, [finalizeUserTurn, flushPlayback, publishAudioLevel]);

  const startMicCapture = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: CAPTURE_SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = stream;
      const ctx = new AudioContext({ sampleRate: CAPTURE_SAMPLE_RATE });
      micCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;
      const scriptNode = ctx.createScriptProcessor(CAPTURE_BUFFER_SIZE, 1, 1);
      scriptNodeRef.current = scriptNode;
      scriptNode.onaudioprocess = (e) => onAudioFrame(e.inputBuffer.getChannelData(0));
      source.connect(scriptNode);
      scriptNode.connect(ctx.destination);
      return true;
    } catch {
      inputLevelRef.current = 0;
      setState(s => ({ ...s, error: 'Microphone access denied', isConnecting: false, inputLevel: 0 }));
      return false;
    }
  }, [onAudioFrame]);

  // ── Public: connect / disconnect / sendText / getTranscript ───────────────
  const cleanup = useCallback(() => {
    closedRef.current = true;
    playTokenRef.current += 1;
    clearAppendTimers();
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    stopOutputMeter();
    inputLevelRef.current = 0;
    outputLevelRef.current = 0;
    lastLevelPublishRef.current = { inputLevel: 0, outputLevel: 0 };
    phaseRef.current = 'idle';
    captureRef.current = { chunks: [], speechActive: false, voicedMs: 0, silenceMs: 0, totalMs: 0 };
    bargeVoicedMsRef.current = 0;
    bargeChunksRef.current = [];
    if (scriptNodeRef.current) { scriptNodeRef.current.disconnect(); scriptNodeRef.current.onaudioprocess = null; scriptNodeRef.current = null; }
    if (sourceNodeRef.current) { sourceNodeRef.current.disconnect(); sourceNodeRef.current = null; }
    if (micStreamRef.current) { micStreamRef.current.getTracks().forEach(t => t.stop()); micStreamRef.current = null; }
    if (micCtxRef.current && micCtxRef.current.state !== 'closed') { micCtxRef.current.close().catch(() => {}); micCtxRef.current = null; }
    if (playbackCtxRef.current && playbackCtxRef.current.state !== 'closed') { playbackCtxRef.current.close().catch(() => {}); }
    playbackCtxRef.current = null;
    analyserRef.current = null;
    nextPlayTimeRef.current = 0;
  }, [stopOutputMeter, clearAppendTimers]);

  useEffect(() => {
    return () => { cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback(async (config: InterviewConfig) => {
    closedRef.current = false;
    configRef.current = config;
    historyRef.current = [];
    fullTranscriptRef.current = [];
    inputLevelRef.current = 0;
    outputLevelRef.current = 0;
    setState(s => ({ ...s, isConnecting: true, error: null, errorUpgradeUrl: null, inputLevel: 0, outputLevel: 0, fullTranscript: [], userTranscript: '', aiTranscript: '', questionCount: 0, elapsedSeconds: 0 }));

    try {
      const res = await authFetch('/api/interview/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persona: config.persona,
          jobDescription: config.jobDescription,
          interviewStyle: config.interviewStyle,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({} as Record<string, unknown>));
        const upgradeUrl = err.limitReached || err.upgrade
          ? (typeof err.upgradeUrl === 'string' ? err.upgradeUrl : '/suite/upgrade')
          : null;
        setState(s => ({ ...s, isConnecting: false, error: String(err.error || `Could not start session (${res.status})`), errorUpgradeUrl: upgradeUrl }));
        return;
      }

      const micOk = await startMicCapture();
      if (!micOk) return; // startMicCapture set the error + isConnecting:false

      if (closedRef.current) return;
      setState(s => ({ ...s, isConnected: true, isConnecting: false }));
      timerRef.current = setInterval(() => {
        setState(s => ({ ...s, elapsedSeconds: s.elapsedSeconds + 1 }));
      }, 1000);

      // The interviewer speaks first: introduce + first question.
      void runTurn({ kickoff: true });
    } catch (error: any) {
      if (closedRef.current) return;
      setState(s => ({ ...s, isConnecting: false, error: error?.message || 'Failed to connect', errorUpgradeUrl: null }));
    }
  }, [runTurn, startMicCapture]);

  const disconnect = useCallback(() => {
    const transcript = fullTranscriptRef.current;
    cleanup();
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
  }, [cleanup]);

  const getTranscript = useCallback(() => fullTranscriptRef.current, []);

  const sendText = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean || closedRef.current) return;
    // Abort any in-flight turn first: without this, its runTurn keeps going and
    // both requests reach appendTranscript('ai', …), double-appending the reply.
    // The aborted turn's catch treats a non-timeout AbortError as silent.
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    // Interrupt any current playback, then run a text-driven turn.
    flushPlayback();
    void runTurn({ text: clean });
  }, [flushPlayback, runTurn]);

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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Encode mono Float32 PCM frames as a 16-bit WAV Blob at `sampleRate`. */
function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  let length = 0;
  for (const c of chunks) length += c.length;
  const pcm = new Int16Array(length);
  let offset = 0;
  for (const c of chunks) {
    for (let i = 0; i < c.length; i++) {
      const s = Math.max(-1, Math.min(1, c[i]));
      pcm[offset++] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
  }

  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const writeString = (pos: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(pos + i, str.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  let pos = 44;
  for (let i = 0; i < pcm.length; i++, pos += 2) view.setInt16(pos, pcm[i], true);

  return new Blob([buffer], { type: 'audio/wav' });
}

'use client';

/**
 * AvatarCanvas — 3D avatar component using TalkingHead.js (loaded via CDN)
 * 
 * TalkingHead uses dynamic import() internally for lip-sync modules,
 * which breaks Turbopack's static analysis. Loading via CDN avoids this
 * and is the library author's recommended approach for web apps.
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface AvatarCanvasProps {
  isSpeaking: boolean;
  isConnected: boolean;
  onLoaded?: () => void;
}

// CDN URL for TalkingHead (ESM module)
const TALKINGHEAD_CDN = 'https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@1.2/modules/talkinghead.mjs';

export default function AvatarCanvas({ isSpeaking, isConnected, onLoaded }: AvatarCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<any>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!containerRef.current) return;
    let mounted = true;

    const initAvatar = async () => {
      try {
        // Dynamic ESM import from CDN — avoids Turbopack bundling issues
        const module = await import(/* webpackIgnore: true */ TALKINGHEAD_CDN);
        const TalkingHead = module.TalkingHead;

        if (!mounted || !containerRef.current) return;

        const head = new TalkingHead(containerRef.current, {
          cameraView: 'upper',
          cameraDistance: 0,
          modelFPS: 30,
          modelPixelRatio: 1,
          lipsyncModules: ['en'],
          lipsyncLang: 'en',
        });

        headRef.current = head;

        // Try loading a custom avatar model
        const avatarUrl = '/models/interviewer.glb';
        try {
          await head.showAvatar({
            url: avatarUrl,
            body: 'F',
            avatarMood: 'neutral',
            lipsyncLang: 'en',
          });
        } catch {
          // Model not found — avatar will fall back to error/audio-only state
          console.warn('[Avatar] Custom .glb not found at /models/interviewer.glb');
          if (mounted) {
            setStatus('error');
            setErrorMsg('The 3D layer is unavailable, so Taco will continue in live audio mode.');
            return;
          }
        }

        if (!mounted) return;
        setStatus('ready');
        onLoaded?.();
      } catch (err: any) {
        console.error('[Avatar] Init error:', err);
        if (mounted) {
          setStatus('error');
          setErrorMsg('The 3D layer is unavailable, so Taco will continue in live audio mode.');
        }
      }
    };

    initAvatar();

    return () => {
      mounted = false;
      if (headRef.current) {
        try { headRef.current.stop?.(); } catch { /* silent */ }
        headRef.current = null;
      }
    };
  }, [onLoaded]);

  return (
    <div className="w-full h-full relative">
      {/* Three.js container */}
      <div ref={containerRef} className="w-full h-full" style={{ minHeight: '400px' }} />

      {/* Loading state */}
      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="w-12 h-12 rounded-full border-2 border-t-transparent mb-4"
            style={{ borderColor: 'color-mix(in srgb, var(--accent) 25%, transparent)', borderTopColor: 'transparent' }}
          />
          <p className="text-sm text-[var(--text-muted)]">Loading avatar...</p>
        </div>
      )}

      {/* Error/fallback — graceful audio-only mode with visual speaking indicator */}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div
            className="w-32 h-32 rounded-full flex items-center justify-center mb-4"
            style={{ background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '2px solid color-mix(in srgb, var(--accent) 20%, transparent)' }}
          >
            <motion.div
              animate={isSpeaking ? { scale: [1, 1.15, 1] } : {}}
              transition={{ duration: 0.8, repeat: Infinity }}
            >
              <span className="material-symbols-rounded text-[56px]" style={{ color: 'var(--accent)' }}>
                {isSpeaking ? 'graphic_eq' : 'person'}
              </span>
            </motion.div>
          </div>
          <p className="text-sm font-semibold text-[var(--text-primary)] mb-1">Live Interview with Taco</p>
          <p className="max-w-[260px] text-center text-[11px] leading-relaxed text-[var(--text-muted)]">{errorMsg}</p>
        </div>
      )}

      {/* Speaking indicator when avatar is loaded */}
      {status === 'ready' && isSpeaking && (
        <div className="absolute top-4 right-4">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
            <span className="text-[11px] font-medium" style={{ color: 'var(--accent)' }}>Speaking</span>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { sonaRibbonPaths } from './sona-v2-geometry';

export interface SonaV2SvgIds {
  ribbon: string;
  fold: string;
  star: string;
  signal: string;
  clip: string;
  mask: string;
  glow: string;
  shadow: string;
}

interface SonaMarkV2DefsProps {
  ids: SonaV2SvgIds;
  locked: boolean;
  error: boolean;
}

export default function SonaMarkV2Defs({ ids, locked, error }: SonaMarkV2DefsProps) {
  return (
    <defs>
      <linearGradient id={ids.ribbon} x1="28" y1="20" x2="91" y2="101" gradientUnits="userSpaceOnUse">
        {locked ? (
          <>
            <stop offset="0" stopColor="var(--taco-paper)" />
            <stop offset="0.52" stopColor="var(--taco-line)" />
            <stop offset="1" stopColor="var(--taco-muted)" />
          </>
        ) : error ? (
          <>
            <stop offset="0" stopColor="var(--taco-soft)" />
            <stop offset="0.55" stopColor="var(--taco-coral-ink)" />
            <stop offset="1" stopColor="var(--taco-coral)" />
          </>
        ) : (
          <>
            <stop offset="0" stopColor="var(--taco-paper)" />
            <stop offset="0.3" stopColor="var(--taco-coral)" />
            <stop offset="0.58" stopColor="var(--taco-coral)" />
            <stop offset="1" stopColor="var(--taco-coral-ink)" />
          </>
        )}
      </linearGradient>
      <linearGradient id={ids.fold} x1="35" y1="30" x2="84" y2="90" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="var(--taco-paper)" stopOpacity="0.72" />
        <stop offset="0.48" stopColor="var(--taco-soft)" stopOpacity="0.08" />
        <stop offset="1" stopColor="var(--taco-coral-ink)" stopOpacity="0.48" />
      </linearGradient>
      <linearGradient id={ids.star} x1="-4" y1="-6" x2="5" y2="6" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="var(--taco-paper)" />
        <stop offset="0.52" stopColor={locked ? 'var(--taco-line)' : 'var(--taco-coral)'} />
        <stop offset="1" stopColor={locked ? 'var(--taco-muted)' : 'var(--taco-coral)'} />
      </linearGradient>
      <linearGradient id={ids.signal} x1="12" y1="40" x2="110" y2="78" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="var(--taco-coral-ink)" />
        <stop offset="0.5" stopColor="var(--taco-coral)" />
        <stop offset="1" stopColor="var(--taco-paper)" />
      </linearGradient>
      <clipPath id={ids.clip} clipPathUnits="userSpaceOnUse">
        <path d={sonaRibbonPaths.idle} fill="none" stroke="#fff" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
      </clipPath>
      <mask id={ids.mask} maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">
        <path d={sonaRibbonPaths.idle} fill="none" stroke="#fff" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
      </mask>
      <filter id={ids.glow} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="5" />
      </filter>
      <filter id={ids.shadow} x="-35%" y="-35%" width="170%" height="185%">
        <feDropShadow dx="0" dy="4" stdDeviation="3.5" floodColor="var(--taco-shadow)" floodOpacity="0.34" />
      </filter>
    </defs>
  );
}

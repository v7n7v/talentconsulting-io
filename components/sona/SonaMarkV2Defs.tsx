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
            <stop offset="0" stopColor="#c9d0d8" />
            <stop offset="0.52" stopColor="#8f9aa8" />
            <stop offset="1" stopColor="#66717f" />
          </>
        ) : error ? (
          <>
            <stop offset="0" stopColor="#b7c1ca" />
            <stop offset="0.55" stopColor="#9a91a2" />
            <stop offset="1" stopColor="#d77e91" />
          </>
        ) : (
          <>
            <stop offset="0" stopColor="#67edf0" />
            <stop offset="0.3" stopColor="#2ebbe4" />
            <stop offset="0.58" stopColor="#7f7cf1" />
            <stop offset="1" stopColor="#ff66c7" />
          </>
        )}
      </linearGradient>
      <linearGradient id={ids.fold} x1="35" y1="30" x2="84" y2="90" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.72" />
        <stop offset="0.48" stopColor="#d7f7ff" stopOpacity="0.08" />
        <stop offset="1" stopColor="#371f91" stopOpacity="0.48" />
      </linearGradient>
      <linearGradient id={ids.star} x1="-4" y1="-6" x2="5" y2="6" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor={locked ? '#d0d5dc' : '#fff0a8'} />
        <stop offset="0.52" stopColor={locked ? '#9ca5b0' : '#ffc866'} />
        <stop offset="1" stopColor={locked ? '#7b8490' : '#ff9d5c'} />
      </linearGradient>
      <linearGradient id={ids.signal} x1="12" y1="40" x2="110" y2="78" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#72e1b7" />
        <stop offset="0.5" stopColor="#6ee7ef" />
        <stop offset="1" stopColor="#ff92cd" />
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
        <feDropShadow dx="0" dy="4" stdDeviation="3.5" floodColor="#172033" floodOpacity="0.34" />
      </filter>
    </defs>
  );
}

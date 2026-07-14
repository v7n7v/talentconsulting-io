export type SonaMarkV2PrimaryState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'success'
  | 'error'
  | 'locked';

export type SonaMarkV2State = SonaMarkV2PrimaryState | 'responding';
export type SonaMarkV2Size = 'xs' | 'sm' | 'md' | 'lg';

export const SONA_VIEW_BOX = '0 0 120 120';

export const sonaV2SizeClass: Record<SonaMarkV2Size, string> = {
  xs: 'h-7 w-7',
  sm: 'h-10 w-10',
  md: 'h-14 w-14',
  lg: 'h-24 w-24',
};

export const sonaV2DetailedSize: Record<SonaMarkV2Size, boolean> = {
  xs: false,
  sm: false,
  md: true,
  lg: true,
};

// Every state keeps the same path command structure so Framer Motion can
// interpolate the ribbon without replacing the mark.
export const sonaRibbonPaths: Record<SonaMarkV2PrimaryState, string> = {
  idle: 'M 84 25 C 69 12 42 15 32 32 C 23 47 37 55 59 60 C 81 65 91 75 87 90 C 82 108 51 111 31 94',
  listening: 'M 86 25 C 71 12 44 15 34 32 C 25 47 39 55 61 60 C 83 65 93 75 89 90 C 84 108 53 111 33 94',
  thinking: 'M 82 24 C 66 11 40 16 31 34 C 24 49 40 54 61 59 C 82 64 92 76 86 91 C 79 108 49 109 30 93',
  speaking: 'M 84 25 C 68 12 41 15 31 32 C 21 48 36 56 60 61 C 84 66 94 75 88 91 C 81 109 49 111 29 94',
  success: 'M 84 25 C 69 12 42 15 32 32 C 23 47 37 55 59 60 C 81 65 91 75 87 90 C 82 108 51 111 31 94',
  error: 'M 84 25 C 69 12 42 15 32 32 C 23 47 37 55 59 60 C 81 65 91 75 87 90 C 82 108 51 111 31 94',
  locked: 'M 84 25 C 69 12 42 15 32 32 C 23 47 37 55 59 60 C 81 65 91 75 87 90 C 82 108 51 111 31 94',
};

export function normalizeSonaV2State(state: SonaMarkV2State): SonaMarkV2PrimaryState {
  return state === 'responding' ? 'speaking' : state;
}

export function clampSonaActivity(activity?: number): number {
  if (typeof activity !== 'number' || !Number.isFinite(activity)) return 0.46;
  return Math.min(1, Math.max(0, activity));
}

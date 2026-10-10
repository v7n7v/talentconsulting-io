import type { ResumeDesignConfig } from './types';

/** Employer-facing document colors; independent of the app interface palette. */
export const RESUME_DESIGN_COLOR_PRESETS = [
  { name: 'Monochrome', colors: { paper: '#ffffff', ink: '#171717', heading: '#171717', accent: '#545454', rail: '#f1f1f1', railInk: '#171717' } },
  { name: 'Warm editorial', colors: { paper: '#fffaf5', ink: '#211a17', heading: '#563429', accent: '#c55136', rail: '#f2e8df', railInk: '#211a17' } },
  { name: 'Blue ink', colors: { paper: '#ffffff', ink: '#17212b', heading: '#18354d', accent: '#2c5f91', rail: '#edf2f7', railInk: '#17212b' } },
] as const satisfies readonly {
  name: string;
  colors: ResumeDesignConfig['colors'];
}[];

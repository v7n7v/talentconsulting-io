export type DashboardMode = 'guest' | 'authenticated';

export type DashboardToolId =
  | 'resume-check'
  | 'job-match'
  | 'ats-analyzer'
  | 'writing-trust'
  | 'quick-polish';

export interface GuestUsageSnapshot {
  used: number;
  cap: number;
  remaining: number;
  resetLabel: string;
  exhausted: boolean;
}

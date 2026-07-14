import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Writing Trust Studio — Originality, Voice & Humanization',
  description: 'Scan writing trust signals, diagnose paragraph risk, humanize with controlled voice-preserving presets, verify originality, and export polished documents.',
  alternates: { canonical: '/suite/writing-tools' },
};

export default function WritingToolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}

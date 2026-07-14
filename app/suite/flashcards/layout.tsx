import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Interview Studio Study Cards | Talent Studio',
  description: 'Study cards now live inside Interview Studio.',
  alternates: { canonical: '/suite/interview-sim' },
};

export default function InterviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}

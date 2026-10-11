import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Interview Studio Study Cards | Talent Studio',
  description: 'Study cards now live inside Interview Studio.',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function InterviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}

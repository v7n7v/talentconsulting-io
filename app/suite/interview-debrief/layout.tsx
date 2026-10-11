import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Interview Debrief | TalentConsulting.io',
  description: 'Log every interview, track question patterns, identify weak spots, and improve your confidence over time.',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Applications Command Center',
  description: 'Track every application, follow-up, interview, offer, and negotiation decision in one command center.',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function ApplicationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}

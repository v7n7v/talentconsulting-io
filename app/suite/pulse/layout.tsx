import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Career Pulse | TalentConsulting.io',
  description: 'Weekly job search health check — pipeline metrics, application velocity, stale alerts, and morale tracking.',
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

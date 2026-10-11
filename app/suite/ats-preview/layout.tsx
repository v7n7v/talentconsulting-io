import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ATS Preview Simulator | TalentConsulting.io',
  description: 'See exactly what recruiters see after your resume gets parsed by Greenhouse, Lever, and Workday ATS systems.',
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

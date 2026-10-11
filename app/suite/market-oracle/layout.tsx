import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Market Oracle — AI Salary & Career Intelligence',
  description: 'Get AI-powered market intelligence: salary benchmarks, demand trends, skill gap analysis, and career trajectory insights for any role or industry.',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function MarketOracleLayout({ children }: { children: React.ReactNode }) {
  return children;
}

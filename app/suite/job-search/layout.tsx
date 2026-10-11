import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Job Search — Find Matching Roles Instantly',
  description: 'Search thousands of job listings matched to your resume and skills. AI-powered relevance scoring and one-click apply preparation.',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function JobSearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}

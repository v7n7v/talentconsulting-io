import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Resume Studio — ATS-Optimized Resume Builder',
  description: 'Build and morph your resume to match a job description, compare 20 curated formats, and export a designed PDF plus a linear Word companion.',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function ResumeLayout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Humanize writing — Edit and review your draft',
  description: 'Improve phrasing and tone, compare every change with your source, and export your reviewed draft. Optional style feedback does not verify facts, authorship, or plagiarism.',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function WritingToolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}

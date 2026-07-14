import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Writing Toolkit',
  description: 'Polish writing, compose career messages, summarize research, and generate citations.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

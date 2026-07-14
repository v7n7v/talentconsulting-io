import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Interview Studio | Talent Studio',
  description: 'Practice, whiteboard, and debrief with Sona-powered interview coaching',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

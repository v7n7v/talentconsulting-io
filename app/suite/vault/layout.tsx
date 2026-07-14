import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Skill Bridge Memory',
  description: 'Saved interview prep and practice memory',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

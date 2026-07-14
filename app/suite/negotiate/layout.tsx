import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Offer Coach',
  description: 'Offer negotiation inside Applications',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

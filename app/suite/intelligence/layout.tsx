import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Career Intelligence | TalentConsulting.io',
  description: 'Your unified career profile — health score, skill gaps, pipeline metrics, interview readiness, and smart recommendations powered by AI.',
  alternates: { canonical: '/suite/intelligence' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

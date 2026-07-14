import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Help Center - Talent Studio Guides',
  description:
    'Learn how to use Talent Studio resume tools, ATS checks, interview practice, application tracking, billing, and account settings.',
  openGraph: {
    title: 'Help Center — Talent Studio',
    description: 'Comprehensive guides for every Talent Studio tool.',
    url: 'https://talentconsulting.io/help',
    type: 'website',
  },
  alternates: {
    canonical: '/help',
  },
};

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return children;
}

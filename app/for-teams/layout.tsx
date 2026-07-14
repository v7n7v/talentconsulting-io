import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Talent Studio for Teams',
  description:
    'AI career readiness tools for universities, workforce programs, staffing teams, and HR teams that need resumes, interviews, and tracking in one workspace.',
  openGraph: {
    title: 'Talent Studio for Teams — Enterprise Career Intelligence',
    description:
      'AI career tools for organizations: bulk resume optimization, structured interview training, and market intelligence dashboards.',
    url: 'https://talentconsulting.io/for-teams',
    type: 'website',
    images: [{ url: '/brand/brand-og-v2.png', width: 1200, height: 630, alt: 'Talent Studio for Teams' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Talent Studio for Teams',
    description: 'AI career intelligence for HR teams, bootcamps, and universities.',
  },
  alternates: {
    canonical: '/for-teams',
  },
};

export default function ForTeamsLayout({ children }: { children: React.ReactNode }) {
  return children;
}

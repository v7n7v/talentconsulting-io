import type { Metadata } from 'next';
import BlogIndex from './BlogIndex';

export const metadata: Metadata = {
  title: 'Career intelligence blog',
  description: 'Expert guides on AI resume building, interview preparation, ATS optimization, and job search strategies. Practical advice from career intelligence professionals.',
  keywords: [
    'resume tips 2026',
    'AI resume builder guide',
    'how to pass ATS',
    'interview prep tips',
    'job search strategy',
    'career advice blog',
    'resume keywords',
    'cover letter tips',
  ],
  openGraph: {
    title: 'Career Intelligence Blog — Talent Studio',
    description: 'Expert career advice: resume building, interview prep, ATS optimization.',
    url: 'https://talentconsulting.io/blog',
  },
  alternates: {
    canonical: '/blog',
  },
};

export default function BlogPage() {
  return <BlogIndex />;
}

import type { Metadata } from 'next';
import JsonLd from '@/components/seo/JsonLd';
import { breadcrumbJsonLd, buildMetadata, faqJsonLd, softwareApplicationJsonLd } from '@/lib/seo';
import AIHumanizerLanding from './AIHumanizerLanding';

const FAQS = [
  { q: 'How does the AI humanizer work?', a: 'It analyzes patterns that often create low-trust writing signals, then revises cadence and specificity while keeping the original meaning intact.' },
  { q: 'Is using an AI humanizer ethical?', a: 'It should be used like an editor: to make your own draft clearer, more specific, and more authentic.' },
  { q: 'Can I humanize my resume with this?', a: 'Yes. Resume mode focuses on clarity, credibility, and formatting-safe improvements.' },
  { q: 'Can detectors still be wrong?', a: 'Yes. Detector scores are indicators, not proof. The safer goal is stronger writing.' },
];

export const metadata: Metadata = buildMetadata({
  title: 'Free AI Humanizer - Preserve Voice & Improve Trust',
  description: 'Transform AI-assisted drafts into natural, polished writing while preserving meaning and voice. Review trust signals, originality, and readability. Free to try.',
  path: '/tools/ai-humanizer',
  keywords: [
    'AI humanizer',
    'humanize AI text',
    'AI text rewriter',
    'AI humanizer free',
    'AI writing trust checker',
    'humanize ChatGPT text',
    'AI to human text converter',
    'AI content humanizer',
  ],
});

export default function AIHumanizerPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Tools', path: '/tools/resume-builder' },
            { name: 'AI Humanizer', path: '/tools/ai-humanizer' },
          ]),
          faqJsonLd(FAQS),
          softwareApplicationJsonLd({
            name: 'Talent Studio AI Humanizer',
            description: 'Voice-preserving AI humanizer for resumes, cover letters, LinkedIn, and recruiter communication.',
            path: '/tools/ai-humanizer',
            features: ['Voice-preserving rewrites', 'Trust signal coaching', 'Readability review', 'Career-writing modes'],
          }),
        ]}
      />
      <AIHumanizerLanding />
    </>
  );
}

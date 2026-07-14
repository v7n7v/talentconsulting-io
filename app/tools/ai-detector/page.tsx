import type { Metadata } from 'next';
import JsonLd from '@/components/seo/JsonLd';
import { breadcrumbJsonLd, buildMetadata, faqJsonLd, softwareApplicationJsonLd } from '@/lib/seo';
import AIDetectorDemo from './AIDetectorDemo';

const FAQS = [
  { q: 'Is this an AI detector?', a: 'It is a writing trust check that reviews AI-like signals, readability, originality cues, and career-writing patterns.' },
  { q: 'Are AI detector results proof?', a: 'No. Detector results are indicators, not proof of authorship. Use them to improve clarity and credibility.' },
  { q: 'Can I check a resume?', a: 'Yes. The tool is built for resumes, cover letters, LinkedIn profiles, essays, and career documents.' },
  { q: 'What should I do after a high-risk result?', a: 'Revise vague language, add specific proof, vary sentence rhythm, and use the AI humanizer for targeted edits.' },
];

export const metadata: Metadata = buildMetadata({
  title: 'Free AI Writing Trust Check - Originality Signals',
  description: 'Free AI writing trust check with 100+ pattern analysis. Review originality, readability, and AI-writing signals for resumes, cover letters, essays, and career documents.',
  path: '/tools/ai-detector',
  keywords: [
    'AI text detector',
    'AI content detector free',
    'check if text is AI generated',
    'ChatGPT detector',
    'AI writing detector',
    'AI detection tool',
    'detect AI writing',
    'AI plagiarism checker',
    'is my text AI generated',
    'AI detector for resumes',
    'AI content checker',
  ],
});

export default function AIDetectorPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Tools', path: '/tools/resume-builder' },
            { name: 'AI Detector', path: '/tools/ai-detector' },
          ]),
          faqJsonLd(FAQS),
          softwareApplicationJsonLd({
            name: 'Talent Studio AI Writing Trust Check',
            description: 'AI writing trust checker for originality, readability, and AI-like writing signals.',
            path: '/tools/ai-detector',
            features: ['AI writing signal review', 'Originality cues', 'Readability feedback', 'Career document checks'],
          }),
        ]}
      />
      <AIDetectorDemo />
    </>
  );
}

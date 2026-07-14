import type { Metadata } from 'next';
import JsonLd from '@/components/seo/JsonLd';
import { breadcrumbJsonLd, buildMetadata, faqJsonLd, softwareApplicationJsonLd } from '@/lib/seo';
import InterviewPrepLanding from './InterviewPrepLanding';

const FAQS = [
  { q: 'What interviews can I practice?', a: 'You can practice behavioral, role-specific, technical, and screening-style questions with AI feedback.' },
  { q: 'Does it support the STAR method?', a: 'Yes. The interview prep workflow helps structure answers around Situation, Task, Action, and Result.' },
  { q: 'Can I practice for a specific role?', a: 'Yes. Use a target role or job description so the questions and feedback match the interview you are preparing for.' },
  { q: 'Is AI interview practice free?', a: 'You can start with the free workflow, with expanded practice available in the full suite.' },
];

export const metadata: Metadata = buildMetadata({
  title: 'AI interview practice',
  description: 'Practice job interviews with AI mock sessions, STAR coaching, role-specific questions, and feedback for your target role.',
  path: '/tools/interview-prep',
  keywords: [
    'AI interview practice',
    'mock interview AI',
    'AI interview prep',
    'behavioral interview practice',
    'STAR method practice',
    'interview simulator',
    'AI interview coach',
    'practice interview questions',
    'job interview preparation',
    'AI mock interview free',
  ],
});

export default function InterviewPrepPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Tools', path: '/tools/resume-builder' },
            { name: 'Interview Prep', path: '/tools/interview-prep' },
          ]),
          faqJsonLd(FAQS),
          softwareApplicationJsonLd({
            name: 'Talent Studio AI Interview Practice',
            description: 'AI mock interview practice with role-specific questions, STAR coaching, and feedback.',
            path: '/tools/interview-prep',
            features: ['Mock interview practice', 'STAR method coaching', 'Behavioral questions', 'Role-specific feedback'],
          }),
        ]}
      />
      <InterviewPrepLanding />
    </>
  );
}

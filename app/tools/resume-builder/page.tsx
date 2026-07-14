import type { Metadata } from 'next';
import JsonLd from '@/components/seo/JsonLd';
import { breadcrumbJsonLd, buildMetadata, faqJsonLd, softwareApplicationJsonLd } from '@/lib/seo';
import ResumeBuilderLanding from './ResumeBuilderLanding';

const FAQS = [
  { q: 'Is the AI resume builder free?', a: 'Yes, you can build and export one resume for free. The Pro plan unlocks unlimited resumes, advanced AI features, and all premium templates.' },
  { q: 'Will my resume pass ATS screening?', a: 'Our templates are designed for ATS parsing, and the ATS score helps you improve keyword fit before submitting.' },
  { q: 'Can I upload my existing resume?', a: 'Yes, upload a PDF or DOCX and the editor can extract your content so you can improve it with AI.' },
  { q: 'Is my data private?', a: 'Your resume data is stored in your private account. Talent Studio does not sell your resume content.' },
];

export const metadata: Metadata = buildMetadata({
  title: 'Free AI resume builder',
  description: 'Build an ATS-friendly resume with AI writing help, templates, keyword guidance, and resume export tools. Start free.',
  path: '/tools/resume-builder',
  keywords: [
    'AI resume builder',
    'free resume builder',
    'ATS resume builder',
    'AI resume maker',
    'resume builder 2026',
    'create resume online free',
    'ATS optimized resume',
    'resume generator AI',
    'professional resume builder',
    'resume builder with AI',
  ],
});

export default function ResumeBuilderPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Tools', path: '/tools/resume-builder' },
            { name: 'Resume Builder', path: '/tools/resume-builder' },
          ]),
          faqJsonLd(FAQS),
          softwareApplicationJsonLd({
            name: 'Talent Studio AI Resume Builder',
            description: 'AI resume builder with ATS scoring, keyword optimization, templates, and export workflows.',
            path: '/tools/resume-builder',
            features: ['ATS resume builder', 'Keyword optimization', 'Resume templates', 'PDF and DOCX export'],
          }),
        ]}
      />
      <ResumeBuilderLanding />
    </>
  );
}

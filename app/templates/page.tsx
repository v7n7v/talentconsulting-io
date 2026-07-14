import type { Metadata } from 'next';
import JsonLd from '@/components/seo/JsonLd';
import { breadcrumbJsonLd, buildMetadata, faqJsonLd } from '@/lib/seo';
import TemplatesGallery from './TemplatesGallery';

const FAQS = [
  { q: 'Are these resume templates free?', a: 'Yes. You can build, preview, and customize a resume with these templates for free.' },
  { q: 'Are the templates ATS-compatible?', a: 'Yes. The templates are designed to parse cleanly through common applicant tracking systems.' },
  { q: 'Can I customize the templates?', a: 'Yes. You can customize sections, content, and formatting in the resume builder.' },
  { q: 'What file formats can I download?', a: 'You can export resume documents in formats designed for both human review and ATS submission.' },
];

export const metadata: Metadata = buildMetadata({
  title: 'Free ATS resume templates',
  description: 'Browse free ATS-friendly resume templates for professional, modern, creative, executive, technical, academic, and entry-level resumes.',
  path: '/templates',
  keywords: [
    'free resume templates',
    'ATS resume templates',
    'ATS friendly resume template',
    'modern resume template 2026',
    'professional resume template',
    'resume template download free',
    'resume design',
    'resume examples',
    'best resume format',
    'resume template for job application',
  ],
});

export default function TemplatesPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Templates', path: '/templates' },
          ]),
          faqJsonLd(FAQS),
        ]}
      />
      <TemplatesGallery />
    </>
  );
}

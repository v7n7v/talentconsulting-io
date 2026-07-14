import { notFound } from 'next/navigation';
import JsonLd from '@/components/seo/JsonLd';
import PublicSeoPage from '@/components/seo/PublicSeoPage';
import { KEYWORD_GUIDES } from '@/lib/seo-content';
import { absoluteUrl, breadcrumbJsonLd, buildMetadata } from '@/lib/seo';

type Props = { params: Promise<{ industry: string }> };

export function generateStaticParams() {
  return KEYWORD_GUIDES.map((item) => ({ industry: item.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { industry } = await params;
  const item = KEYWORD_GUIDES.find((guide) => guide.slug === industry);
  if (!item) return { title: 'Resume Keywords Not Found' };

  return buildMetadata({
    title: item.title,
    description: item.description,
    path: `/resume-keywords/${item.slug}`,
    keywords: [`${item.industry} resume keywords`, 'ATS resume keywords', 'resume keyword optimization', 'resume checker'],
  });
}

export default async function ResumeKeywordsPage({ params }: Props) {
  const { industry } = await params;
  const item = KEYWORD_GUIDES.find((guide) => guide.slug === industry);
  if (!item) notFound();

  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Resume Keywords', path: '/resume-keywords/software-engineering' },
            { name: item.industry, path: `/resume-keywords/${item.slug}` },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: item.title,
            description: item.description,
            mainEntityOfPage: absoluteUrl(`/resume-keywords/${item.slug}`),
            author: { '@type': 'Organization', name: 'TalentConsulting.io' },
            publisher: { '@type': 'Organization', name: 'TalentConsulting.io' },
            datePublished: '2026-05-14T00:00:00Z',
            dateModified: '2026-05-14T00:00:00Z',
          },
        ]}
      />
      <PublicSeoPage
        eyebrow="Resume Keywords"
        title={item.title}
        description={item.description}
        primaryCta={{ label: 'Check keyword fit', href: '/tools/ats-analyzer', eventName: 'seo_ats_analyzer_click' }}
        secondaryCta={{ label: 'Build a resume', href: '/tools/resume-builder', eventName: 'seo_resume_builder_click' }}
        blocks={[
          ...item.keywordGroups.map((group) => ({ title: group.label, items: group.terms })),
          { title: 'Sample bullets', items: item.sampleBullets },
          { title: 'Mistakes to avoid', items: item.mistakes },
          { title: 'How to use them', items: ['Place keywords inside real accomplishments, not a long stuffed list. Mirror the job description language only when it truthfully matches your experience.'] },
        ]}
        calloutTitle={`Optimize your ${item.industry.toLowerCase()} resume for the job description`}
        calloutBody="The best keyword strategy is honest matching: keep your experience accurate, then make sure the ATS can recognize the language recruiters already use."
      />
    </>
  );
}

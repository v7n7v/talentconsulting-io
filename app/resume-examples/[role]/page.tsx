import { notFound } from 'next/navigation';
import JsonLd from '@/components/seo/JsonLd';
import PublicSeoPage from '@/components/seo/PublicSeoPage';
import { RESUME_EXAMPLES } from '@/lib/seo-content';
import { absoluteUrl, breadcrumbJsonLd, buildMetadata } from '@/lib/seo';

type Props = { params: Promise<{ role: string }> };

export function generateStaticParams() {
  return RESUME_EXAMPLES.map((item) => ({ role: item.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { role } = await params;
  const item = RESUME_EXAMPLES.find((example) => example.slug === role);
  if (!item) return { title: 'Resume Example Not Found' };

  return buildMetadata({
    title: item.title,
    description: item.description,
    path: `/resume-examples/${item.slug}`,
    keywords: [`${item.role} resume example`, `${item.role} resume`, 'ATS resume example', 'resume builder'],
  });
}

export default async function ResumeExamplePage({ params }: Props) {
  const { role } = await params;
  const item = RESUME_EXAMPLES.find((example) => example.slug === role);
  if (!item) notFound();

  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Resume Examples', path: '/resume-examples/software-engineer' },
            { name: item.role, path: `/resume-examples/${item.slug}` },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: item.title,
            description: item.description,
            mainEntityOfPage: absoluteUrl(`/resume-examples/${item.slug}`),
            author: { '@type': 'Organization', name: 'TalentConsulting.io' },
            publisher: { '@type': 'Organization', name: 'TalentConsulting.io' },
            datePublished: '2026-05-14T00:00:00Z',
            dateModified: '2026-05-14T00:00:00Z',
          },
        ]}
      />
      <PublicSeoPage
        eyebrow="Resume Example"
        title={item.title}
        description={item.description}
        primaryCta={{ label: 'Build this resume free', href: '/tools/resume-builder', eventName: 'seo_resume_builder_click' }}
        secondaryCta={{ label: 'Browse ATS templates', href: '/templates', eventName: 'seo_template_click' }}
        blocks={[
          { title: 'ATS summary', items: [item.summary] },
          { title: 'Keywords to include', items: item.keywords },
          { title: 'Strong resume bullets', items: item.bullets },
          { title: 'Recommended sections', items: item.sections },
          { title: 'Mistakes to avoid', items: item.mistakes },
          { title: 'Next step', items: ['Paste a target job description into the resume builder, then compare your bullets against the role language before applying.'] },
        ]}
        calloutTitle={`Turn this ${item.role.toLowerCase()} example into your own resume`}
        calloutBody="Use the example as structure, then replace every claim with your own scope, tools, and measurable outcomes. The resume builder can help tailor the final version to a real job description."
      />
    </>
  );
}

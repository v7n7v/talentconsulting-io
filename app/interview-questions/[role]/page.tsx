import { notFound } from 'next/navigation';
import JsonLd from '@/components/seo/JsonLd';
import PublicSeoPage from '@/components/seo/PublicSeoPage';
import { INTERVIEW_GUIDES } from '@/lib/seo-content';
import { absoluteUrl, breadcrumbJsonLd, buildMetadata } from '@/lib/seo';

type Props = { params: Promise<{ role: string }> };

export function generateStaticParams() {
  return INTERVIEW_GUIDES.map((item) => ({ role: item.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { role } = await params;
  const item = INTERVIEW_GUIDES.find((guide) => guide.slug === role);
  if (!item) return { title: 'Interview Guide Not Found' };

  return buildMetadata({
    title: item.title,
    description: item.description,
    path: `/interview-questions/${item.slug}`,
    keywords: [`${item.role} interview questions`, `${item.role} interview prep`, 'STAR interview answers', 'AI interview practice'],
  });
}

export default async function InterviewQuestionsPage({ params }: Props) {
  const { role } = await params;
  const item = INTERVIEW_GUIDES.find((guide) => guide.slug === role);
  if (!item) notFound();

  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Interview Questions', path: '/interview-questions/software-engineer' },
            { name: item.role, path: `/interview-questions/${item.slug}` },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: item.title,
            description: item.description,
            mainEntityOfPage: absoluteUrl(`/interview-questions/${item.slug}`),
            author: { '@type': 'Organization', name: 'TalentConsulting.io' },
            publisher: { '@type': 'Organization', name: 'TalentConsulting.io' },
            datePublished: '2026-05-14T00:00:00Z',
            dateModified: '2026-05-14T00:00:00Z',
          },
        ]}
      />
      <PublicSeoPage
        eyebrow="Interview Questions"
        title={item.title}
        description={item.description}
        primaryCta={{ label: 'Practice with AI', href: '/tools/interview-prep', eventName: 'seo_interview_prep_click' }}
        secondaryCta={{ label: 'Build your resume first', href: '/tools/resume-builder', eventName: 'seo_resume_builder_click' }}
        blocks={[
          { title: 'Questions to practice', items: item.questions },
          { title: 'What strong answers include', items: item.answerMoves },
          { title: 'Mistakes to avoid', items: item.mistakes },
          { title: 'STAR structure', items: ['Situation: set the context quickly.', 'Task: name your responsibility.', 'Action: explain your choices.', 'Result: quantify the outcome and learning.'] },
          { title: 'Prep workflow', items: ['Choose 6 stories from your work history, map each to 2 or 3 question types, then practice aloud until the answer sounds natural.'] },
        ]}
        calloutTitle={`Practice ${item.role.toLowerCase()} interviews before the real one`}
        calloutBody="Good interview prep is not memorizing scripts. It is learning which stories prove the skills the role needs, then delivering them clearly under pressure."
      />
    </>
  );
}

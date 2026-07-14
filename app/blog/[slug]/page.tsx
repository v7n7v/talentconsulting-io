import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import JsonLd from '@/components/seo/JsonLd';
import { articleJsonLd, breadcrumbJsonLd, parseBlogDate } from '@/lib/seo';
import { BLOG_POSTS } from '../posts';
import ArticlePage from './ArticlePage';

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return BLOG_POSTS.map(post => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = BLOG_POSTS.find(p => p.slug === slug);
  if (!post) return { title: 'Article Not Found' };

  return {
    title: post.title,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      url: `https://talentconsulting.io/blog/${post.slug}`,
      type: 'article',
      publishedTime: parseBlogDate(post.date).toISOString(),
    },
    alternates: {
      canonical: `/blog/${post.slug}`,
    },
  };
}

export default async function BlogArticlePage({ params }: Props) {
  const { slug } = await params;
  const post = BLOG_POSTS.find(p => p.slug === slug);
  if (!post) notFound();

  return (
    <>
      <JsonLd
        data={[
          articleJsonLd(post),
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Blog', path: '/blog' },
            { name: post.title, path: `/blog/${post.slug}` },
          ]),
        ]}
      />
      <ArticlePage slug={slug} />
    </>
  );
}

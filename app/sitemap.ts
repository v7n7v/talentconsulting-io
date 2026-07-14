import type { MetadataRoute } from 'next';
import { BLOG_POSTS } from './blog/posts';
import { KEYWORD_GUIDES, INTERVIEW_GUIDES, RESUME_EXAMPLES } from '@/lib/seo-content';
import { SEO_LAST_MODIFIED, SITE_URL, parseBlogDate } from '@/lib/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  // Public marketing pages
  const publicPages = [
    { url: SITE_URL, priority: 1.0, changeFrequency: 'weekly' as const, lastModified: SEO_LAST_MODIFIED },
    { url: `${SITE_URL}/templates`, priority: 0.9, changeFrequency: 'weekly' as const, lastModified: SEO_LAST_MODIFIED },
    { url: `${SITE_URL}/tools/ai-detector`, priority: 0.9, changeFrequency: 'weekly' as const, lastModified: SEO_LAST_MODIFIED },
    { url: `${SITE_URL}/tools/resume-builder`, priority: 0.9, changeFrequency: 'weekly' as const, lastModified: SEO_LAST_MODIFIED },
    { url: `${SITE_URL}/tools/ai-humanizer`, priority: 0.9, changeFrequency: 'weekly' as const, lastModified: SEO_LAST_MODIFIED },
    { url: `${SITE_URL}/tools/interview-prep`, priority: 0.9, changeFrequency: 'weekly' as const, lastModified: SEO_LAST_MODIFIED },
    { url: `${SITE_URL}/tools/ats-analyzer`, priority: 0.9, changeFrequency: 'weekly' as const, lastModified: SEO_LAST_MODIFIED },
    { url: `${SITE_URL}/blog`, priority: 0.8, changeFrequency: 'daily' as const, lastModified: SEO_LAST_MODIFIED },
    { url: `${SITE_URL}/for-teams`, priority: 0.7, changeFrequency: 'monthly' as const, lastModified: SEO_LAST_MODIFIED },
    { url: `${SITE_URL}/help`, priority: 0.6, changeFrequency: 'monthly' as const, lastModified: SEO_LAST_MODIFIED },
  ];

  const seoPages = [
    ...RESUME_EXAMPLES.map((item) => `/resume-examples/${item.slug}`),
    ...KEYWORD_GUIDES.map((item) => `/resume-keywords/${item.slug}`),
    ...INTERVIEW_GUIDES.map((item) => `/interview-questions/${item.slug}`),
  ].map((path) => ({
    url: `${SITE_URL}${path}`,
    priority: 0.75,
    changeFrequency: 'monthly' as const,
    lastModified: SEO_LAST_MODIFIED,
  }));

  // Blog articles
  const blogPages = BLOG_POSTS.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    priority: 0.7,
    changeFrequency: 'monthly' as const,
    lastModified: parseBlogDate(post.date),
  }));

  return [...publicPages, ...seoPages, ...blogPages];
}

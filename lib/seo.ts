import type { Metadata } from 'next';
import type { BlogPost } from '@/app/blog/posts';

export const SITE_URL = 'https://talentconsulting.io';
export const SITE_NAME = 'TalentConsulting.io';
export const COMPANY_NAME = 'TalentConsulting.io';
export const SEO_LAST_MODIFIED = new Date('2026-05-14T00:00:00Z');
export const BRAND_WORDMARK_PATH = '/brand/talentconsulting-logo-white.png';
export const BRAND_OG_IMAGE_PATH = '/brand/brand-og-v2.png';

export type FaqItem = {
  q: string;
  a: string;
};

export type BreadcrumbItem = {
  name: string;
  path: string;
};

export function absoluteUrl(path = '/') {
  if (path.startsWith('http')) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function buildMetadata({
  title,
  description,
  path,
  keywords,
  type = 'website',
}: {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  type?: 'website' | 'article';
}): Metadata {
  return {
    title,
    description,
    keywords,
    alternates: {
      canonical: path,
    },
    openGraph: {
      type,
      title,
      description,
      url: absoluteUrl(path),
      siteName: SITE_NAME,
      images: [
        {
          url: BRAND_OG_IMAGE_PATH,
          width: 1200,
          height: 630,
          alt: `${title} - ${SITE_NAME}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [BRAND_OG_IMAGE_PATH],
    },
  };
}

export function parseBlogDate(date: string) {
  return new Date(`${date} 00:00:00 GMT`);
}

export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function faqJsonLd(faqs: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.a,
      },
    })),
  };
}

export function articleJsonLd(post: BlogPost) {
  const published = parseBlogDate(post.date).toISOString();

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: published,
    dateModified: published,
    author: {
      '@type': 'Organization',
      name: COMPANY_NAME,
      url: SITE_URL,
    },
    publisher: {
      '@type': 'Organization',
      name: COMPANY_NAME,
      logo: {
        '@type': 'ImageObject',
        url: absoluteUrl(BRAND_WORDMARK_PATH),
      },
    },
    mainEntityOfPage: absoluteUrl(`/blog/${post.slug}`),
  };
}

export function softwareApplicationJsonLd({
  name,
  description,
  path,
  features,
}: {
  name: string;
  description: string;
  path: string;
  features: string[];
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: absoluteUrl(path),
    description,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    featureList: features,
  };
}

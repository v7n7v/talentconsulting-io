import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/auth/', '/suite/', '/settings', '/_next/'],
      },
    ],
    sitemap: 'https://talentconsulting.io/sitemap.xml',
  };
}

import type { Metadata } from 'next';
import { Google_Sans_Flex, Inter, JetBrains_Mono, Poppins } from 'next/font/google';
import './globals.css';
import '@/components/taco-theme.css';
import '@/components/taco-public-palette.css';
import '@/components/taco-identity.css';
import ClientProviders from '@/components/ClientProviders';
import ConsentAwareAnalytics from '@/components/privacy/ConsentAwareAnalytics';

const BRAND_NAME = 'TalentConsulting.io';
const BRAND_WORDMARK = '/brand/talentconsulting-logo-white.png';
const BRAND_OG_IMAGE = '/opengraph-image';
const BRAND_MARK_192 = '/taco-icon-192.png';
const BRAND_MARK_512 = '/taco-icon-512.png';
const BRAND_APPLE_ICON = '/taco-icon-180.png';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const googleSansFlex = Google_Sans_Flex({
  subsets: ['latin'],
  variable: '--font-brand',
  display: 'swap',
  weight: 'variable',
  axes: ['GRAD', 'opsz'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

/* Display face for the landing page. Self-hosted through next/font rather than
   fetched from fonts.googleapis.com, so the marketing page adds no third-party
   origin and no render-blocking request. */
const poppins = Poppins({
  subsets: ['latin'],
  variable: '--font-poppins',
  display: 'swap',
  weight: ['300', '400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: {
    default: 'Taco — AI Job Search, Grounded in Your Experience',
    template: '%s | Taco by TalentConsulting',
  },
  description: 'Turn your experience into a focused job search. Taco helps you find suitable roles, prepare applications, and review your next move. Start with your resume.',
  keywords: ['AI job search assistant', 'resume job match', 'resume tailoring', 'job application workspace', 'interview preparation', 'Taco', 'TalentConsulting'],
  authors: [{ name: BRAND_NAME, url: 'https://talentconsulting.io' }],
  creator: BRAND_NAME,
  publisher: BRAND_NAME,
  category: 'Career Tools',
  metadataBase: new URL('https://talentconsulting.io'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://talentconsulting.io',
    siteName: BRAND_NAME,
    title: 'Taco — Your next chapter starts with you',
    description: 'AI job search, grounded in your experience. Find suitable roles and prepare applications for your review.',
    images: [
      {
        url: BRAND_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: 'Taco by TalentConsulting — Your next chapter starts with you',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Taco — Your next chapter starts with you',
    description: 'AI job search, grounded in your experience. Find suitable roles and prepare applications for your review.',
    images: [BRAND_OG_IMAGE],
    creator: '@talentconsulting',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: BRAND_MARK_192, sizes: '192x192', type: 'image/png' },
      { url: BRAND_MARK_512, sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/favicon.svg',
    apple: [
      { url: BRAND_APPLE_ICON, sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/site.webmanifest',
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? {
        verification: {
          google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
        },
      }
    : {}),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {/* Preconnect to critical third-party origins */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://firebaseinstallations.googleapis.com" />
        <link rel="dns-prefetch" href="https://generativelanguage.googleapis.com" />

        {/* Material Symbols is global in this App Router root layout. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router root layout loads this icon font for every route. */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0&display=swap" />

        {/* Google Analytics 4 — deferred to not block first paint */}
        {/* FOUC prevention — set theme before first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                /* The .js gate. Every rule that HIDES something on the landing
                   page is scoped to html.js, so if this line never runs -
                   script error, blocked inline script, an in-app WebView with
                   JS off - the page is fully readable instead of blank.
                   Reveals are an enhancement; they are never the thing that
                   makes content exist. It sits outside the try below because
                   it must not be skipped when localStorage throws. */
                document.documentElement.classList.add('js');
                try {
                  var s = localStorage.getItem('talent-studio-theme') || 'system';
                  var t = s;
                  if (s === 'system') {
                    t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  }
                  document.documentElement.setAttribute('data-theme', t);
                  document.documentElement.classList.add(t);
                } catch(e) {
                  document.documentElement.setAttribute('data-theme', 'dark');
                  document.documentElement.classList.add('dark');
                }
              })();
            `,
          }}
        />
        {/* Global JSON-LD Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': 'Organization',
                  name: BRAND_NAME,
                  url: 'https://talentconsulting.io',
                  logo: `https://talentconsulting.io${BRAND_WORDMARK}`,
                  sameAs: [],
                },
                {
                  '@type': 'WebSite',
                  name: 'Taco by TalentConsulting',
                  url: 'https://talentconsulting.io',
                },
              ],
            }),
          }}
        />
      </head>
      <body className={`${inter.variable} ${googleSansFlex.variable} ${jetbrainsMono.variable} ${poppins.variable} font-sans antialiased`}>
        <ConsentAwareAnalytics />
        <div className="relative z-10">
          <ClientProviders>{children}</ClientProviders>
        </div>
      </body>
    </html>
  );
}

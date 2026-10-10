/** @type {import('next').NextConfig} */
const nextConfig = {
  // Let isolated local fixture reviews run alongside the normal dev server.
  ...(process.env.NODE_ENV === 'development' && process.env.TACO_PREVIEW_DIST_DIR
    ? { distDir: process.env.TACO_PREVIEW_DIST_DIR } : {}),
  output: 'standalone',
  reactStrictMode: true,
  allowedDevOrigins: ['localhost', '127.0.0.1'],
  compress: true,
  poweredByHeader: false,
  devIndicators: false,
  serverExternalPackages: ['mammoth', 'pdf-parse'],
  // The binary parser runs in an eval worker. Its string-literal requires are
  // invisible to Next's dependency tracer, so retain its runtime PDF assets.
  outputFileTracingIncludes: {
    '/api/gauntlet/parse-resume': ['./node_modules/pdfjs-dist/package.json', './node_modules/pdfjs-dist/legacy/build/*.mjs', './node_modules/pdfjs-dist/cmaps/**/*', './node_modules/pdfjs-dist/standard_fonts/**/*'],
    '/api/workspace-preview/resume-import': ['./node_modules/pdfjs-dist/package.json', './node_modules/pdfjs-dist/legacy/build/*.mjs', './node_modules/pdfjs-dist/cmaps/**/*', './node_modules/pdfjs-dist/standard_fonts/**/*'],
  },
  images: {
    domains: [],
  },
  webpack: (config) => {
    // PDF.js worker configuration
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    return config;
  },
  turbopack: {},
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=(), payment=(self)'
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://apis.google.com https://www.gstatic.com https://*.google.com https://www.googletagmanager.com https://js.stripe.com https://*.js.stripe.com https://checkout.stripe.com https://cdnjs.cloudflare.com https://challenges.cloudflare.com https://cdn.jsdelivr.net",
              "worker-src 'self' blob: https://cdnjs.cloudflare.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' data: blob: https:",
              "connect-src 'self' data: blob: https://*.firebaseio.com https://*.googleapis.com https://www.google-analytics.com https://*.google-analytics.com https://region1.google-analytics.com https://api.groq.com https://api.deepgram.com https://api.elevenlabs.io https://generativelanguage.googleapis.com wss://generativelanguage.googleapis.com wss://*.firebaseio.com https://api.stripe.com https://js.stripe.com https://checkout.stripe.com https://hooks.stripe.com https://cdnjs.cloudflare.com https://challenges.cloudflare.com https://cdn.jsdelivr.net",
              "media-src 'self' blob:",
              "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://apis.google.com https://js.stripe.com https://*.js.stripe.com https://checkout.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com https://client.wra-api.net",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests",
            ].join('; ')
          },
          ...(process.env.STAGING_HOSTNAME ? [{
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow, noarchive'
          }] : [])
        ]
      }
    ]
  },
}

module.exports = nextConfig

// frontend/next.config.mjs
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const apiBase = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000').replace(/\/+$/, '');

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // Proxy /api/* ke backend
    // Proxy /auth/* ke backend (PENTING agar Signin/Me cookie bekerja lewat dev proxy)
    return [
      { source: '/api/:path*', destination: `${apiBase}/api/:path*` },
      { source: '/auth/:path*', destination: `${apiBase}/auth/:path*` },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
};

export default withNextIntl(nextConfig);

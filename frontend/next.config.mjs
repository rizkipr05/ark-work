import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const api =
      process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
    const target = `${api.replace(/\/+$/, '')}/api/:path*`;

    return [
      // Proxy semua request /api/* ke backend
      { source: '/api/:path*', destination: target },
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

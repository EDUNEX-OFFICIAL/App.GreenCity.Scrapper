/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig = {
  transpilePackages: ['@greencity/db', '@greencity/shared', '@greencity/queue'],
  async headers() {
    return [
      {
        source: '/api/integration/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

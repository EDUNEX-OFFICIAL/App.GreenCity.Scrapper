/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@greencity/db', '@greencity/shared', '@greencity/queue'],
};

export default nextConfig;

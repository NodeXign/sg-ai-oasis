/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.lumacdn.com' },
      { protocol: 'https', hostname: 'social-images.lu.ma' },
    ],
  },
  async redirects() {
    return [
      { source: '/',      destination: '/zh',        permanent: false },
      { source: '/month', destination: '/zh/events', permanent: false },
      { source: '/jobs',  destination: '/zh/jobs',   permanent: false },
    ];
  },
};

export default nextConfig;

import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/zh', '/en'],
        disallow: ['/api/', '/zh/admin', '/en/admin'],
      },
    ],
    sitemap: 'https://sgaioasis.vercel.app/sitemap.xml',
  };
}

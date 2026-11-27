import type { MetadataRoute } from 'next';

const BASE = 'https://sgaioasis.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes = [
    { path: '/zh', priority: 1.0 },
    { path: '/en', priority: 0.9 },
    { path: '/zh/events', priority: 0.9 },
    { path: '/en/events', priority: 0.8 },
    { path: '/zh/jobs', priority: 0.9 },
    { path: '/en/jobs', priority: 0.8 },
    { path: '/zh/gonogo', priority: 0.8 },
    { path: '/en/gonogo', priority: 0.7 },
  ];

  return routes.map((r) => ({
    url: `${BASE}${r.path}`,
    lastModified: now,
    changeFrequency: 'daily',
    priority: r.priority,
  }));
}

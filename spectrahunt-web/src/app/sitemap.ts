import type { MetadataRoute } from 'next';
import { SHOWCASE_IDS } from '@/lib/showcases';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://spectrahunt.space';
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now },
    { url: `${base}/sky`, lastModified: now },
    { url: `${base}/candidates`, lastModified: now },
    { url: `${base}/about`, lastModified: now },
    ...SHOWCASE_IDS.map((id) => ({ url: `${base}/blink/${id}`, lastModified: now })),
  ];
}

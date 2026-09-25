import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DRISHTI: Dynamic Repository for Infrared Spectral History and Transient Inspection',
    short_name: 'DRISHTI',
    description: 'Blink repeated SPHEREx passes of any sky patch; spot comets, asteroids, variables. Built by team AKASHTORI for NASA Space Apps Challenge 2026.',
    start_url: '/',
    display: 'standalone',
    background_color: '#05060c',
    theme_color: '#05060c',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SpectraHunt — hunt what moves in the infrared sky',
    short_name: 'SpectraHunt',
    description: 'Blink repeated SPHEREx passes of any sky patch; spot comets, asteroids, variables.',
    start_url: '/',
    display: 'standalone',
    background_color: '#05060c',
    theme_color: '#05060c',
    icons: [
      {
        src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='6' fill='%2305060c'/%3E%3Ccircle cx='12' cy='12' r='6.5' fill='none' stroke='%237c83fd' stroke-width='2'/%3E%3Ccircle cx='12' cy='12' r='2' fill='%23eef0f8'/%3E%3C/svg%3E",
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}

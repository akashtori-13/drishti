import type { CapacitorConfig } from '@capacitor/cli';

// Offline-first native shell: serves the static export bundled in `out/`.
// Same source as web/desktop — no per-platform web code.
const config: CapacitorConfig = {
  appId: 'stellar.akashtori.space',
  appName: 'STELLAR',
  webDir: 'out',
  server: {
    // https scheme (not capacitor://) so the service worker + secure
    // APIs (geolocation, orientation) behave exactly like the PWA.
    androidScheme: 'https',
    hostname: 'stellar.app',
  },
};

export default config;

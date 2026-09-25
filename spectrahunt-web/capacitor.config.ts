import type { CapacitorConfig } from '@capacitor/cli';

// Offline-first native shell: serves the static export bundled in `out/`.
// Same source as web/desktop — no per-platform web code.
const config: CapacitorConfig = {
  appId: 'drishti.akashtori.space',
  appName: 'DRISHTI',
  webDir: 'out',
  server: {
    // https scheme (not capacitor://) so the service worker + secure
    // APIs (geolocation, orientation) behave exactly like the PWA.
    androidScheme: 'https',
    hostname: 'drishti.app',
  },
  android: {
    // WebView background behind the page: matches --space so there is no
    // white flash on launch or overscroll. System bars are styled natively
    // in res/values (colors.xml + styles.xml).
    backgroundColor: '#05060c',
  },
};

export default config;

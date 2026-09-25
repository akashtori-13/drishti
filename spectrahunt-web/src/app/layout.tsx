import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./reveal.css";
import { Sprite } from "@/components/Icon";
import SplashGate from "@/components/SplashGate";
import SwRegister from "@/components/SwRegister";
import NativeShell from "@/components/NativeShell";
import { SKY_ALLSKY_PREVIEW_URL } from "@/lib/sky";

export const viewport: Viewport = {
  themeColor: "#05060c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "DRISHTI: hunt what moves in the infrared sky",
  description:
    "DRISHTI compares repeated SPHEREx passes of the same patch of sky and flags what moved or changed: comets, asteroids and variable stars.",
  openGraph: {
    title: "DRISHTI: hunt what moves in the infrared sky",
    description:
      "Search any object or sky position, then blink between SPHEREx epochs to see what changed.",
    type: "website",
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'DRISHTI' }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og-image.png'],
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-180.png', sizes: '180x180', type: 'image/png' }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preload" as="image" href={SKY_ALLSKY_PREVIEW_URL} fetchPriority="high" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..800&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col" data-view="home">
        <div id="splash" aria-hidden="true">
          <svg className="splash-mark" viewBox="0 0 512 512" focusable="false">
            <circle cx="241.33" cy="270.67" r="106.56" fill="currentColor" />
            <path d="M473.97 206.47A241.33 241.33 0 1 1 305.53 38.03A21.94 21.94 0 0 1 293.86 80.33A197.45 197.45 0 1 0 431.67 218.14A21.94 21.94 0 0 1 473.97 206.47Z" fill="currentColor" />
            <path className="trap" d="M320.06 154.37A10.97 10.97 0 0 1 318 141.71L384.53 8.66A15.67 15.67 0 0 1 409.62 4.58L507.42 102.38A15.67 15.67 0 0 1 503.34 127.47L370.29 194A10.97 10.97 0 0 1 357.63 191.94Z" fill="currentColor" />
          </svg>
          <span className="splash-word">DRISHTI</span>
        </div>
        <SplashGate />
        <Sprite />
        <SwRegister />
        <NativeShell />
        <noscript>
          <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: '#05060c', color: '#eef0f8', zIndex: 200, padding: 24, textAlign: 'center' }}>
            DRISHTI needs JavaScript to draw the sky and run searches. Please enable it and reload.
          </div>
        </noscript>
        {children}
      </body>
    </html>
  );
}

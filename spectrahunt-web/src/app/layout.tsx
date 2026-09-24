import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./reveal.css";
import { Sprite } from "@/components/Icon";
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
  title: "STELLAR: hunt what moves in the infrared sky",
  description:
    "STELLAR compares repeated SPHEREx passes of the same patch of sky and flags what moved or changed: comets, asteroids and variable stars.",
  openGraph: {
    title: "STELLAR: hunt what moves in the infrared sky",
    description:
      "Search any object or sky position, then blink between SPHEREx epochs to see what changed.",
    type: "website",
  },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-180.png',
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
        <Sprite />
        <SwRegister />
        <NativeShell />
        <noscript>
          <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: '#05060c', color: '#eef0f8', zIndex: 200, padding: 24, textAlign: 'center' }}>
            STELLAR needs JavaScript to draw the sky and run searches. Please enable it and reload.
          </div>
        </noscript>
        {children}
      </body>
    </html>
  );
}

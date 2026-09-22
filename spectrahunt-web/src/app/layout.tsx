import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Sprite } from "@/components/Icon";
import { SKY_ALLSKY_PREVIEW_URL } from "@/lib/sky";

export const viewport: Viewport = {
  themeColor: "#05060c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "SpectraHunt: hunt what moves in the infrared sky",
  description:
    "SpectraHunt compares repeated SPHEREx passes of the same patch of sky and flags what moved or changed: comets, asteroids and variable stars.",
  openGraph: {
    title: "SpectraHunt: hunt what moves in the infrared sky",
    description:
      "Search any object or sky position, then blink between SPHEREx epochs to see what changed.",
    type: "website",
  },
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='6' fill='%2305060c'/%3E%3Ccircle cx='12' cy='12' r='6.5' fill='none' stroke='%237c83fd' stroke-width='2'/%3E%3Ccircle cx='12' cy='12' r='2' fill='%23eef0f8'/%3E%3C/svg%3E",
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
        <noscript>
          <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: '#05060c', color: '#eef0f8', zIndex: 200, padding: 24, textAlign: 'center' }}>
            SpectraHunt needs JavaScript to draw the sky and run searches. Please enable it and reload.
          </div>
        </noscript>
        {children}
      </body>
    </html>
  );
}

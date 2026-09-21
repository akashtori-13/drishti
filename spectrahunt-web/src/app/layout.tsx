import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpectraHunt — watch the infrared sky move",
  description: "Blink SPHEREx epochs to spot comets, asteroids and variables. NASA Space Apps 2026.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;500;600;700&family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col bg-slate-950 text-white">
        {children}
      </body>
    </html>
  );
}

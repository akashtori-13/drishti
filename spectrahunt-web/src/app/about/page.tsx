import type { Metadata } from 'next';
import SiteChrome from '@/components/SiteChrome';
import AboutPage from '@/components/AboutPage';

export const metadata: Metadata = {
  title: 'About — DRISHTI',
  description:
    'What DRISHTI is, where its data comes from, and the people behind the public SPHEREx blink comparator.',
};

export default function About() {
  return (
    <SiteChrome>
      <AboutPage />
    </SiteChrome>
  );
}

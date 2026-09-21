import type { Metadata } from 'next';
import SiteChrome from '@/components/SiteChrome';
import AboutPage from '@/components/AboutPage';

export const metadata: Metadata = {
  title: 'About — SpectraHunt',
};

export default function About() {
  return (
    <SiteChrome>
      <AboutPage />
    </SiteChrome>
  );
}

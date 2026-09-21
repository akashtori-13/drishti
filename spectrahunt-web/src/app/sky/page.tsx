import type { Metadata } from 'next';
import SiteChrome from '@/components/SiteChrome';
import SkyPage from '@/components/SkyPage';

export const metadata: Metadata = {
  title: 'Sky map — SpectraHunt',
};

export default function Sky() {
  return (
    <SiteChrome>
      <SkyPage />
    </SiteChrome>
  );
}

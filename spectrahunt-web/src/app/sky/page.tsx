import type { Metadata } from 'next';
import SiteChrome from '@/components/SiteChrome';
import SkyPage from '@/components/SkyPage';

export const metadata: Metadata = {
  title: 'SkyMap — STELLAR',
};

export default function Sky() {
  return (
    <SiteChrome>
      <SkyPage />
    </SiteChrome>
  );
}

import type { Metadata } from 'next';
import SiteChrome from '@/components/SiteChrome';
import MissionPage from '@/components/MissionPage';

export const metadata: Metadata = {
  title: 'Mission — STELLAR',
};

export default function Mission() {
  return (
    <SiteChrome>
      <MissionPage />
    </SiteChrome>
  );
}

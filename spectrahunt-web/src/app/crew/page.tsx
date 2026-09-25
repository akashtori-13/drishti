import type { Metadata } from 'next';
import SiteChrome from '@/components/SiteChrome';
import TeamPage from '@/components/TeamPage';

export const metadata: Metadata = {
  title: 'Crew — DRISHTI',
};

export default function Crew() {
  return (
    <SiteChrome>
      <TeamPage />
    </SiteChrome>
  );
}

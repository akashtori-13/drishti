import type { Metadata } from 'next';
import SiteChrome from '@/components/SiteChrome';
import TeamPage from '@/components/TeamPage';

export const metadata: Metadata = {
  title: 'Team — STELLAR',
};

export default function About() {
  return (
    <SiteChrome>
      <TeamPage />
    </SiteChrome>
  );
}

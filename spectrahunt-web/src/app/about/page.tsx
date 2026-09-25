import type { Metadata } from 'next';
import SiteChrome from '@/components/SiteChrome';
import SettingsPage from '@/components/SettingsPage';

export const metadata: Metadata = {
  title: 'Settings — DRISHTI',
};

export default function About() {
  return (
    <SiteChrome>
      <SettingsPage />
    </SiteChrome>
  );
}

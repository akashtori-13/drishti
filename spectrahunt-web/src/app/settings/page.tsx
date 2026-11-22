import type { Metadata } from 'next';
import SiteChrome from '@/components/SiteChrome';
import SettingsPage from '@/components/SettingsPage';

export const metadata: Metadata = {
  title: 'Settings — DRISHTI',
};

export default function Settings() {
  return (
    <SiteChrome>
      <SettingsPage />
    </SiteChrome>
  );
}

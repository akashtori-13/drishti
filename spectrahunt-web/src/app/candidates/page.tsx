import type { Metadata } from 'next';
import SiteChrome from '@/components/SiteChrome';
import CandidatesPage from '@/components/CandidatesPage';

export const metadata: Metadata = {
  title: 'Featured — DRISHTI',
};

export default function Candidates() {
  return (
    <SiteChrome>
      <CandidatesPage />
    </SiteChrome>
  );
}

import type { Metadata } from 'next';
import SiteChrome from '@/components/SiteChrome';
import HomePage from '@/components/HomePage';

export const metadata: Metadata = {
  title: 'STELLAR: hunt what moves in the infrared sky',
};

export default function Home() {
  return (
    <SiteChrome showTutorial>
      <div className="view active">
        <HomePage />
      </div>
    </SiteChrome>
  );
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SiteChrome from '@/components/SiteChrome';
import BlinkPage from '@/components/BlinkPage';
import { SHOWCASE_IDS } from '@/lib/showcases';

export function generateStaticParams() {
  return SHOWCASE_IDS.map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Blink ${id} — DRISHTI` };
}

export default async function BlinkRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const known = (SHOWCASE_IDS as readonly string[]).includes(id);
  if (!known) notFound();
  return (
    <SiteChrome>
      <BlinkPage id={id} />
    </SiteChrome>
  );
}

import type { Metadata } from 'next';
import IntroExperience from '@/components/orbital/IntroExperience';

export const metadata: Metadata = {
  title: 'Enter orbit — STELLAR',
  description: 'You arrive in orbit. The real SPHEREx is circling a real Earth, right now. Click it to see what it is doing.',
};

export default function Intro() {
  return <IntroExperience />;
}

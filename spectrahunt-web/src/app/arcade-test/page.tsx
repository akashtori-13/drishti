'use client';
import WaitGame from '@/components/WaitGame';
export default function ArcadeTest() {
  return (
    <main style={{ padding: 12, maxWidth: 560, margin: '0 auto' }}>
      <WaitGame headline="Decoding your blink" target="Orion field"
        progress={{ done: 2, total: 8, label: 'Decoding first pair of 8 epochs…' }} />
    </main>
  );
}

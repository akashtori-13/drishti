'use client';

import { useAppStore } from '@/lib/store';

export default function FieldPage() {
  const { selectedField } = useAppStore();

  if (!selectedField) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">No Field Selected</h2>
          <p className="text-slate-400">Select a location from the map or search</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Field View</h1>
          <p className="text-slate-400 font-mono">
            RA: {selectedField.ra.toFixed(6)}° | Dec: {selectedField.dec.toFixed(6)}°
          </p>
        </div>

        <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-8 text-center">
          <p className="text-slate-400 mb-4">Blink viewer and field details coming soon</p>
          <p className="text-sm text-slate-500">
            This component will display real SPHEREx cutouts, epoch blinking, 
            and SkyBot cross-match results
          </p>
        </div>
      </div>
    </div>
  );
}

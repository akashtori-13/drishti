'use client';

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import dynamic from 'next/dynamic';

const MapComponent = dynamic(() => import('./SkyMap'), { ssr: false });

export default function MapPage() {
  const { coverage, isLoadingCoverage, errorCoverage } = useAppStore();

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">All-Sky Coverage Map</h1>
          <p className="text-slate-400">
            SPHEREx QR2 survey coverage by epoch count (5° grid cells)
          </p>
        </div>

        {isLoadingCoverage && (
          <div className="flex items-center justify-center h-96">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500" />
          </div>
        )}

        {errorCoverage && (
          <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg">
            {errorCoverage}
          </div>
        )}

        {!isLoadingCoverage && !errorCoverage && coverage && (
          <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-4">
            <MapComponent coverage={coverage} />
          </div>
        )}

        {/* Legend */}
        <div className="mt-6 bg-slate-800/30 rounded-xl border border-slate-700/50 p-4">
          <h3 className="text-sm font-semibold mb-3">Epoch Count</h3>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, '5+'].map((count, i) => (
              <div key={i} className="flex items-center space-x-2">
                <div
                  className="w-6 h-3 rounded"
                  style={{
                    backgroundColor: `hsl(${240 + (i * 30)}, 70%, ${50 - i * 8}%)`
                  }}
                />
                <span className="text-xs text-slate-300">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

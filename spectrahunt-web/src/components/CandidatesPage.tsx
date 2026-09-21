'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { ExternalLink, CheckCircle, AlertCircle } from 'lucide-react';

export default function CandidatesPage() {
  const { candidates, isLoadingCandidates, errorCandidates, loadCandidates } = useAppStore();

  useEffect(() => {
    loadCandidates({ limit: 50 });
  }, [loadCandidates]);

  if (isLoadingCandidates) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500" />
      </div>
    );
  }

  if (errorCandidates) {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg">
            {errorCandidates}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Moving Object Candidates</h1>
          <p className="text-slate-400">
            {candidates.length} candidate{candidates.length !== 1 ? 's' : ''} detected
          </p>
        </div>

        {candidates.length === 0 ? (
          <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-8 text-center">
            <AlertCircle className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Candidates Yet</h2>
            <p className="text-slate-400">
              No moving object candidates have been detected in the indexed fields.
              This could mean the region hasn't been processed yet or there are no detections.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {candidates.map((candidate) => (
              <div
                key={candidate.id}
                className="bg-slate-800/30 rounded-xl border border-slate-700/50 p-4 hover:border-purple-500/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-white">{candidate.name}</h3>
                    <p className="text-xs text-slate-400 font-mono">
                      {candidate.ra.toFixed(4)}, {candidate.dec.toFixed(4)}
                    </p>
                  </div>
                  {candidate.skybot_match ? (
                    <span className="flex items-center space-x-1 text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full">
                      <CheckCircle className="w-3 h-3" />
                      <span>Known Object</span>
                    </span>
                  ) : (
                    <span className="flex items-center space-x-1 text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded-full">
                      <AlertCircle className="w-3 h-3" />
                      <span>Unidentified</span>
                    </span>
                  )}
                </div>

                <div className="space-y-2 text-sm text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Band</span>
                    <span>{candidate.band}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Significance</span>
                    <span className="text-purple-400">{candidate.significance_sigma.toFixed(1)}σ</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Motion</span>
                    <span>{candidate.motion_arcsec.toFixed(2)}″</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Rate</span>
                    <span>{(candidate.motion_arcsec / Math.abs(candidate.mjd_b - candidate.mjd_a)).toFixed(2)}″/day</span>
                  </div>
                </div>

                {candidate.skybot_match && (
                  <div className="mt-3 pt-3 border-t border-slate-700/50">
                    <p className="text-xs text-slate-400">
                      Match: {candidate.skybot_match}
                    </p>
                  </div>
                )}

                {/* Thumbnail placeholders */}
                <div className="mt-4 flex space-x-2">
                  {candidate.thumb_urls.slice(0, 2).map((url, i) => (
                    <div
                      key={i}
                      className="w-16 h-16 bg-slate-700 rounded-lg flex items-center justify-center text-xs text-slate-500"
                    >
                      Epoch {i + 1}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { create } from 'zustand';

export type CompareMode = 'blink' | 'side' | 'swipe' | 'diff' | 'replay';

interface AppState {
  compareMode: CompareMode;
  epochIdx: number;
  band: number;
  showMarkers: boolean;
  tutorialDone: boolean;
  /** Artifact preview modal: showcase id or null. Null = closed. */
  previewId: string | null;
  openPreview: (id: string) => void;
  closePreview: () => void;
  setCompareMode: (m: CompareMode) => void;
  setEpochIdx: (i: number) => void;
  setBand: (b: number) => void;
  setShowMarkers: (v: boolean) => void;
  setTutorialDone: (v: boolean) => void;
}

function load(key: string, fallback: boolean): boolean {
  try {
    return localStorage.getItem(key) === '1' ? true : localStorage.getItem(key) === '0' ? false : fallback;
  } catch { return fallback; }
}

export const useAppStore = create<AppState>((set) => ({
  compareMode: 'blink',
  epochIdx: 0,
  band: 3,
  showMarkers: true,
  tutorialDone: typeof window !== 'undefined' ? load('sh-tutorial', false) : false,

  setCompareMode: (m) => set({ compareMode: m }),
  setEpochIdx: (i) => set({ epochIdx: Math.max(0, i) }),
  setBand: (b) => set({ band: b }),
  setShowMarkers: (v) => set({ showMarkers: v }),
  setTutorialDone: (v) => {
    set({ tutorialDone: v });
    try { localStorage.setItem('sh-tutorial', v ? '1' : '0'); } catch { /* noop */ }
  },
  previewId: null,
  openPreview: (id: string) => set({ previewId: id }),
  closePreview: () => set({ previewId: null }),
}));

/** Shareable blink URL: /blink/<id>?band=&epoch=&mode= */
export function blinkURL(id: string, opts?: { band?: number; epoch?: number; mode?: CompareMode }): string {
  const p = new URLSearchParams();
  if (opts?.band !== undefined) p.set('band', String(opts.band));
  if (opts?.epoch !== undefined) p.set('epoch', String(opts.epoch));
  if (opts?.mode) p.set('mode', opts.mode);
  const qs = p.toString();
  return `/blink/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`;
}

import { create } from 'zustand';
import type { Colormap } from '@/lib/astro';
import type { GuideShowcaseCtx } from '@/lib/guide';

export type CompareMode = 'blink' | 'side' | 'swipe' | 'diff' | 'replay' | 'color';

interface AppState {
  compareMode: CompareMode;
  epochIdx: number;
  band: number;
  showMarkers: boolean;
  tutorialDone: boolean;
  /** Global colorblind mode: locks thumbnails, previews, colormaps to cividis. */
  colorblind: boolean;
  /** Autoplay artifact preview frames on open. */
  autoplay: boolean;
  /** Artifact preview modal: showcase id or null. Null = closed. */
  previewId: string | null;
  openPreview: (id: string) => void;
  closePreview: () => void;
  setCompareMode: (m: CompareMode) => void;
  setEpochIdx: (i: number) => void;
  setBand: (b: number) => void;
  setShowMarkers: (v: boolean) => void;
  setColorblind: (v: boolean) => void;
  /** One-shot entry colormap for preview→blink handoff (transient, not persisted). */
  entryCmap: Colormap | null;
  setEntryCmap: (v: Colormap | null) => void;
  setAutoplay: (v: boolean) => void;
  setTutorialDone: (v: boolean) => void;
  /** Guide buddy (Pip): global enable switch. */
  guideEnabled: boolean;
  setGuideEnabled: (v: boolean) => void;
  /** Guide panel open state. */
  guideOpen: boolean;
  setGuideOpen: (v: boolean) => void;
  /** Blink ids whose first-visit greeting was read. */
  guideBlinkSeen: string[];
  markGuideBlinkSeen: (id: string) => void;
  /** Current blink showcase for guide summaries (set by BlinkPage). */
  guideShowcase: GuideShowcaseCtx | null;
  setGuideShowcase: (v: GuideShowcaseCtx | null) => void;
}

function loadList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
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
  colorblind: typeof window !== 'undefined' ? load('sh-colorblind', false) : false,
  autoplay: typeof window !== 'undefined' ? load('sh-autoplay', true) : true,

  setCompareMode: (m) => set({ compareMode: m }),
  setEpochIdx: (i) => set({ epochIdx: Math.max(0, i) }),
  setBand: (b) => set({ band: b }),
  setShowMarkers: (v) => set({ showMarkers: v }),
  setColorblind: (v) => {
    set({ colorblind: v });
    try { localStorage.setItem('sh-colorblind', v ? '1' : '0'); } catch { /* noop */ }
  },
  setAutoplay: (v) => {
    set({ autoplay: v });
    try { localStorage.setItem('sh-autoplay', v ? '1' : '0'); } catch { /* noop */ }
  },
  setTutorialDone: (v) => {
    set({ tutorialDone: v });
    try { localStorage.setItem('sh-tutorial', v ? '1' : '0'); } catch { /* noop */ }
  },
  guideEnabled: typeof window !== 'undefined' ? load('sh-guide', false) : false,
  setGuideEnabled: (v) => {
    set({ guideEnabled: v });
    if (!v) set({ guideOpen: false });
    try { localStorage.setItem('sh-guide', v ? '1' : '0'); } catch { /* noop */ }
  },
  guideOpen: false,
  setGuideOpen: (v) => set({ guideOpen: v }),
  guideBlinkSeen: typeof window !== 'undefined' ? loadList('sh-guide-blink') : [],
  markGuideBlinkSeen: (id) => set((st) => {
    if (st.guideBlinkSeen.includes(id)) return st;
    const next = [...st.guideBlinkSeen, id];
    try { localStorage.setItem('sh-guide-blink', JSON.stringify(next)); } catch { /* noop */ }
    return { guideBlinkSeen: next };
  }),
  guideShowcase: null as GuideShowcaseCtx | null,
  setGuideShowcase: (v: GuideShowcaseCtx | null) => set({ guideShowcase: v }),
  entryCmap: null,
  setEntryCmap: (v) => set({ entryCmap: v }),
  previewId: null,
  openPreview: (id: string) => set({ previewId: id }),
  closePreview: () => set({ previewId: null }),
}));

/** Shareable blink URL: /blink/<id>?band=&epoch=&mode=&cmap= */
export function blinkURL(id: string, opts?: { band?: number; epoch?: number; mode?: CompareMode; cmap?: string }): string {
  const p = new URLSearchParams();
  if (opts?.band !== undefined) p.set('band', String(opts.band));
  if (opts?.epoch !== undefined) p.set('epoch', String(opts.epoch));
  if (opts?.mode) p.set('mode', opts.mode);
  if (opts?.cmap) p.set('cmap', opts.cmap);
  const qs = p.toString();
  return `/blink/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`;
}

import { create } from 'zustand';

export type View = 'home' | 'blink' | 'sky' | 'candidates' | 'about';
export type CompareMode = 'blink' | 'side' | 'swipe' | 'diff';

interface AppState {
  currentView: View;
  showcaseId: string;
  compareMode: CompareMode;
  epochIdx: number;
  band: number;
  advanced: boolean;
  showMarkers: boolean;
  tutorialDone: boolean;
  setCurrentView: (view: View) => void;
  openShowcase: (id: string) => void;
  setCompareMode: (m: CompareMode) => void;
  setEpochIdx: (i: number) => void;
  setBand: (b: number) => void;
  setAdvanced: (v: boolean) => void;
  setShowMarkers: (v: boolean) => void;
  setTutorialDone: (v: boolean) => void;
}

const HASH: Record<View, string> = {
  home: '#/',
  blink: '#/blink',
  sky: '#/sky',
  candidates: '#/candidates',
  about: '#/about',
};

function load(key: string, fallback: boolean): boolean {
  try {
    return localStorage.getItem(key) === '1' ? true : localStorage.getItem(key) === '0' ? false : fallback;
  } catch { return fallback; }
}

export const useAppStore = create<AppState>((set) => ({
  currentView: 'home',
  showcaseId: '3i-atlas',
  compareMode: 'blink',
  epochIdx: 0,
  band: 3,
  advanced: typeof window !== 'undefined' ? load('sh-advanced', true) : true,
  showMarkers: true,
  tutorialDone: typeof window !== 'undefined' ? load('sh-tutorial', false) : false,

  setCurrentView: (view) => {
    set({ currentView: view });
    if (typeof window !== 'undefined') window.location.hash = HASH[view];
  },

  openShowcase: (id) => {
    set({ showcaseId: id, currentView: 'blink', epochIdx: 0 });
    if (typeof window !== 'undefined') window.location.hash = `#/blink/${id}`;
  },
  setCompareMode: (m) => set({ compareMode: m }),
  setEpochIdx: (i) => set({ epochIdx: Math.max(0, i) }),
  setBand: (b) => set({ band: b }),
  setAdvanced: (v) => {
    set({ advanced: v });
    try { localStorage.setItem('sh-advanced', v ? '1' : '0'); } catch { /* noop */ }
  },
  setShowMarkers: (v) => set({ showMarkers: v }),
  setTutorialDone: (v) => {
    set({ tutorialDone: v });
    try { localStorage.setItem('sh-tutorial', v ? '1' : '0'); } catch { /* noop */ }
  },
}));

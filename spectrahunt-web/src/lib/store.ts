import { create } from 'zustand';

export type View = 'home' | 'blink' | 'sky' | 'candidates' | 'about';

interface AppState {
  currentView: View;
  showcaseId: string;
  setCurrentView: (view: View) => void;
  openShowcase: (id: string) => void;
}

const HASH: Record<View, string> = {
  home: '#/',
  blink: '#/blink',
  sky: '#/sky',
  candidates: '#/candidates',
  about: '#/about',
};

export const useAppStore = create<AppState>((set) => ({
  currentView: 'home',
  showcaseId: '3i-atlas',

  setCurrentView: (view) => {
    set({ currentView: view });
    if (typeof window !== 'undefined') window.location.hash = HASH[view];
  },

  openShowcase: (id) => {
    set({ showcaseId: id, currentView: 'blink' });
    if (typeof window !== 'undefined') window.location.hash = `#/blink/${id}`;
  },
}));

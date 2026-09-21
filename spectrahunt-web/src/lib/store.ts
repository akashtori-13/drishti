import { create } from 'zustand';
import { getCandidates, getCoverage, getStatus, type Candidate, type Coverage, type Status } from '@/lib/api';

interface AppState {
  // Data
  status: Status | null;
  coverage: Coverage | null;
  candidates: Candidate[];
  
  // Loading states
  isLoadingStatus: boolean;
  isLoadingCoverage: boolean;
  isLoadingCandidates: boolean;
  
  // Errors
  errorStatus: string | null;
  errorCoverage: string | null;
  errorCandidates: string | null;
  
  // UI State
  currentView: 'home' | 'map' | 'field' | 'candidates' | 'about';
  selectedField: { ra: number; dec: number } | null;
  searchQuery: string;
  
  // Actions
  loadStatus: () => Promise<void>;
  loadCoverage: () => Promise<void>;
  loadCandidates: (params?: { since?: string; band?: number; status?: string; limit?: number }) => Promise<void>;
  setCurrentView: (view: 'home' | 'map' | 'field' | 'candidates' | 'about') => void;
  setSelectedField: (ra: number, dec: number) => void;
  setSearchQuery: (query: string) => void;
  clearErrors: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  status: null,
  coverage: null,
  candidates: [],
  
  isLoadingStatus: false,
  isLoadingCoverage: false,
  isLoadingCandidates: false,
  
  errorStatus: null,
  errorCoverage: null,
  errorCandidates: null,
  
  currentView: 'home',
  selectedField: null,
  searchQuery: '',
  
  loadStatus: async () => {
    set({ isLoadingStatus: true, errorStatus: null });
    try {
      const status = await getStatus();
      set({ status, isLoadingStatus: false });
    } catch (error) {
      set({ 
        errorStatus: error instanceof Error ? error.message : 'Failed to load status',
        isLoadingStatus: false 
      });
    }
  },
  
  loadCoverage: async () => {
    set({ isLoadingCoverage: true, errorCoverage: null });
    try {
      const coverage = await getCoverage();
      set({ coverage, isLoadingCoverage: false });
    } catch (error) {
      set({ 
        errorCoverage: error instanceof Error ? error.message : 'Failed to load coverage',
        isLoadingCoverage: false 
      });
    }
  },
  
  loadCandidates: async (params) => {
    set({ isLoadingCandidates: true, errorCandidates: null });
    try {
      const candidates = await getCandidates(params);
      set({ candidates, isLoadingCandidates: false });
    } catch (error) {
      set({ 
        errorCandidates: error instanceof Error ? error.message : 'Failed to load candidates',
        isLoadingCandidates: false 
      });
    }
  },
  
  setCurrentView: (view) => {
    set({ currentView: view });
    
    // Update URL hash for routing
    if (typeof window !== 'undefined') {
      const hashMap = {
        home: '#/',
        map: '#/map',
        field: '#/field',
        candidates: '#/candidates',
        about: '#/about'
      };
      window.location.hash = hashMap[view];
    }
  },
  
  setSelectedField: (ra, dec) => {
    set({ selectedField: { ra, dec }, currentView: 'field' });
    if (typeof window !== 'undefined') {
      window.location.hash = `#/field?ra=${ra}&dec=${dec}`;
    }
  },
  
  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },
  
  clearErrors: () => {
    set({
      errorStatus: null,
      errorCoverage: null,
      errorCandidates: null
    });
  }
}));

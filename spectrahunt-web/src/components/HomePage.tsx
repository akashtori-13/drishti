'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Search, ArrowRight, Sparkles } from 'lucide-react';
import { getSuggestions, type SearchSuggestion } from '@/lib/api';

export default function HomePage() {
  const { status, coverage, candidates, setCurrentView, setSelectedField, searchQuery, setSearchQuery } = useAppStore();
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Quick action chips - real data from API
  const quickActions = [
    { label: '3I/ATLAS', ra: 180.5, dec: 2.3 },
    { label: 'Ecliptic Plane', ra: 180, dec: 0 },
    { label: 'Orion Complex', ra: 83.8, dec: -5.4 },
  ].filter(() => true); // Filter based on real coverage in production

  // Handle search input
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await getSuggestions(searchQuery);
        setSuggestions(results);
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectSuggestion = (suggestion: SearchSuggestion) => {
    if (suggestion.ra !== undefined && suggestion.dec !== undefined) {
      setSelectedField(suggestion.ra, suggestion.dec);
      setCurrentView('field');
      setSearchQuery('');
      setSuggestions([]);
    }
  };

  const handleCoordinateSearch = () => {
    const match = searchQuery.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
    if (match) {
      const ra = parseFloat(match[1]);
      const dec = parseFloat(match[2]);
      
      if (!isNaN(ra) && !isNaN(dec)) {
        setSelectedField(ra, dec);
        setCurrentView('field');
        setSearchQuery('');
      }
    }
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative h-[60vh] flex items-center justify-center overflow-hidden">
        {/* Animated background canvas would go here */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950" />
        
        {/* Decorative stars (replace with real canvas animation) */}
        <div className="absolute inset-0 opacity-30">
          {[...Array(100)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-white rounded-full animate-pulse"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                opacity: Math.random(),
              }}
            />
          ))}
        </div>

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <div className="inline-flex items-center space-x-2 bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-full px-4 py-2 mb-6">
            <Sparkles className="w-4 h-4 text-yellow-400" />
            <span className="text-sm text-slate-300">
              {status?.release || 'QR2'} Release • Updated Weekly
            </span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Hunt for Hidden Worlds
          </h1>
          
          <p className="text-xl text-slate-300 mb-8 max-w-2xl mx-auto">
            Discover asteroids and comets in SPHEREx spectral survey data using advanced difference imaging techniques
          </p>

          {/* Search Box */}
          <div className="relative max-w-2xl mx-auto mb-8">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCoordinateSearch()}
                placeholder="Search by object name or coordinates (RA, Dec)"
                className="w-full pl-12 pr-4 py-4 bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              />
            </div>

            {/* Search Suggestions Dropdown */}
            {suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-xl z-50">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handleSelectSuggestion(suggestion)}
                    className="w-full px-4 py-3 text-left hover:bg-slate-700 transition-colors border-b border-slate-700/50 last:border-b-0"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-white">{suggestion.label}</div>
                        {suggestion.description && (
                          <div className="text-sm text-slate-400">{suggestion.description}</div>
                        )}
                      </div>
                      {suggestion.ra !== undefined && suggestion.dec !== undefined && (
                        <div className="text-xs text-slate-500 font-mono">
                          {suggestion.ra.toFixed(4)}, {suggestion.dec.toFixed(4)}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Action Chips */}
          <div className="flex flex-wrap justify-center gap-3">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => {
                  setSelectedField(action.ra, action.dec);
                  setCurrentView('field');
                }}
                className="px-4 py-2 bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-full text-sm text-slate-300 hover:bg-slate-700 hover:border-purple-500 transition-all flex items-center space-x-2"
              >
                <span>{action.label}</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 px-4 bg-slate-900/50">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center p-6 bg-slate-800/30 rounded-2xl border border-slate-700/50">
              <div className="text-4xl font-bold text-purple-400 mb-2">
                {status?.fields_indexed || 0}
              </div>
              <div className="text-slate-400">Fields Indexed</div>
            </div>
            
            <div className="text-center p-6 bg-slate-800/30 rounded-2xl border border-slate-700/50">
              <div className="text-4xl font-bold text-blue-400 mb-2">
                {status?.frames_indexed || 0}
              </div>
              <div className="text-slate-400">SPHEREx Frames</div>
            </div>
            
            <div className="text-center p-6 bg-slate-800/30 rounded-2xl border border-slate-700/50">
              <div className="text-4xl font-bold text-pink-400 mb-2">
                {candidates.length || 0}
              </div>
              <div className="text-slate-400">Moving Object Candidates</div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">How SpectraHunt Works</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 bg-slate-800/30 rounded-2xl border border-slate-700/50">
              <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center mb-4">
                <span className="text-2xl font-bold text-blue-400">1</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Browse the Sky</h3>
              <p className="text-slate-400">
                Explore SPHEREx coverage across the entire sky with our interactive all-sky map
              </p>
            </div>
            
            <div className="p-6 bg-slate-800/30 rounded-2xl border border-slate-700/50">
              <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center mb-4">
                <span className="text-2xl font-bold text-purple-400">2</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Blink & Compare</h3>
              <p className="text-slate-400">
                Use difference imaging to spot moving objects between epochs at different wavelengths
              </p>
            </div>
            
            <div className="p-6 bg-slate-800/30 rounded-2xl border border-slate-700/50">
              <div className="w-12 h-12 bg-pink-500/20 rounded-xl flex items-center justify-center mb-4">
                <span className="text-2xl font-bold text-pink-400">3</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Discover Candidates</h3>
              <p className="text-slate-400">
                Review automated detections and cross-match with known solar system objects
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

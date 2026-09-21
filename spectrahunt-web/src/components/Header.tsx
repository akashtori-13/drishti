'use client';

import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { Search, Map as MapIcon, List, Info, Zap } from 'lucide-react';

export default function Header() {
  const { currentView, setCurrentView } = useAppStore();

  type ViewId = 'home' | 'map' | 'field' | 'candidates' | 'about' | 'blink';

  const navItems: Array<{ id: ViewId; label: string; icon: typeof Search; hash: string }> = [
    { id: 'home', label: 'Home', icon: Search, hash: '#/' },
    { id: 'blink', label: 'Blink', icon: Zap, hash: '#/blink' },
    { id: 'map', label: 'Sky Map', icon: MapIcon, hash: '#/map' },
    { id: 'candidates', label: 'Candidates', icon: List, hash: '#/candidates' },
    { id: 'about', label: 'About', icon: Info, hash: '#/about' },
  ];

  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <Link href="#/" className="flex items-center space-x-3 group">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center">
              <span className="text-white font-bold text-lg">S</span>
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                SpectraHunt
              </h1>
              <p className="text-xs text-slate-400">SPHEREx Moving Object Discovery</p>
            </div>
          </Link>

          <nav className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentView(item.id)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${
                    isActive
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button className="p-2 text-slate-400 hover:text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

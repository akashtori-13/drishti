'use client';

import Link from 'next/link';
import { useAppStore, type View } from '@/lib/store';
import { Search, Zap, Globe, Info } from 'lucide-react';

const NAV: Array<{ id: View; label: string; icon: typeof Search; hash: string }> = [
  { id: 'home', label: 'Home', icon: Search, hash: '#/' },
  { id: 'blink', label: 'Blink', icon: Zap, hash: '#/blink' },
  { id: 'sky', label: 'Sky', icon: Globe, hash: '#/sky' },
  { id: 'about', label: 'About', icon: Info, hash: '#/about' },
];

export default function Header() {
  const { currentView, setCurrentView } = useAppStore();

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
              <p className="text-xs text-slate-400">Watch the infrared sky move</p>
            </div>
          </Link>

          <nav className="flex items-center space-x-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentView(item.id)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-all ${
                    active ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-medium hidden sm:inline">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}

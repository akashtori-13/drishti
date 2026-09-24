'use client';

export type IconName =
  | 'logo' | 'search' | 'skymap' | 'back' | 'fwd' | 'down' | 'x'
  | 'play' | 'pause' | 'ext' | 'menu' | 'dice';

/** Single-copy SVG sprite (render once in layout). */
export function Sprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <symbol id="i-logo" viewBox="0 0 512 512">
          <circle cx="241.33" cy="270.67" r="106.56" fill="currentColor" />
          <path d="M473.97 206.47A241.33 241.33 0 1 1 305.53 38.03A21.94 21.94 0 0 1 293.86 80.33A197.45 197.45 0 1 0 431.67 218.14A21.94 21.94 0 0 1 473.97 206.47Z" fill="currentColor" />
          <path d="M320.06 154.37A10.97 10.97 0 0 1 318 141.71L384.53 8.66A15.67 15.67 0 0 1 409.62 4.58L507.42 102.38A15.67 15.67 0 0 1 503.34 127.47L370.29 194A10.97 10.97 0 0 1 357.63 191.94Z" fill="currentColor" />
        </symbol>
        <symbol id="i-search" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M20 20l-4.9-4.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" /></symbol>
        <symbol id="i-skymap" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><ellipse cx="12" cy="12" rx="4" ry="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M3.5 12h17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" /><circle cx="15.5" cy="9" r="1.6" fill="currentColor" /></symbol>
        <symbol id="i-back" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-fwd" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-down" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></symbol>
        <symbol id="i-play" viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" /></symbol>
        <symbol id="i-pause" viewBox="0 0 24 24"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" /><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" /></symbol>
        <symbol id="i-ext" viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></symbol>
        <symbol id="i-dice" viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="8.3" cy="8.3" r="1.4" fill="currentColor" /><circle cx="15.7" cy="15.7" r="1.4" fill="currentColor" /><circle cx="15.7" cy="8.3" r="1.4" fill="currentColor" /><circle cx="8.3" cy="15.7" r="1.4" fill="currentColor" /></symbol>
      </defs>
    </svg>
  );
}

/** Icon accessor (sprite must be mounted once in layout). */
export default function Icon({ name, className = 'icon' }: { name: IconName; className?: string }) {
  return (
    <svg className={className} aria-hidden="true"><use href={`#i-${name}`} /></svg>
  );
}

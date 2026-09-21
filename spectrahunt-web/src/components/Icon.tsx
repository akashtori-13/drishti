'use client';

export type IconName =
  | 'logo' | 'search' | 'back' | 'fwd' | 'down' | 'x'
  | 'play' | 'pause' | 'ext' | 'menu';

/** Single-copy SVG sprite (render once in layout). */
export function Sprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="spec" gradientUnits="userSpaceOnUse" x1="1" y1="0" x2="23" y2="0">
          <stop offset="0" stopColor="#7c83fd" /><stop offset=".2" stopColor="#5aa9e6" />
          <stop offset=".4" stopColor="#4fc9a8" /><stop offset=".6" stopColor="#e8c34a" />
          <stop offset=".8" stopColor="#f08a4b" /><stop offset="1" stopColor="#e85d4a" />
        </linearGradient>
        <symbol id="i-logo" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="7.5" fill="none" stroke="url(#spec)" strokeWidth="2.2" />
          <path d="M12 1.5v4.2M12 18.3v4.2M1.5 12h4.2M18.3 12h4.2" stroke="url(#spec)" strokeWidth="2" strokeLinecap="round" fill="none" />
          <circle cx="12" cy="12" r="2.3" fill="#eef0f8" />
        </symbol>
        <symbol id="i-search" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M20 20l-4.9-4.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" /></symbol>
        <symbol id="i-back" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-fwd" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-down" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></symbol>
        <symbol id="i-play" viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" /></symbol>
        <symbol id="i-pause" viewBox="0 0 24 24"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" /><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" /></symbol>
        <symbol id="i-ext" viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></symbol>
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

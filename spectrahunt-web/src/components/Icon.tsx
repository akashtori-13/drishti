'use client';

export type IconName =
  | 'logo' | 'search' | 'skymap' | 'back' | 'fwd' | 'down' | 'x'
  | 'play' | 'pause' | 'ext' | 'menu' | 'dice' | 'target'
  | 'home' | 'split' | 'info' | 'dl' | 'clock' | 'sliders' | 'arrow' | 'team'
  | 'globe' | 'mail' | 'code' | 'github' | 'briefcase';

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
        <symbol id="i-skymap" viewBox="0 0 24 24"><path d="M12 2.5c.9 6.3 2.7 8.1 9 9-6.3.9-8.1 2.7-9 9-.9-6.3-2.7-8.1-9-9 6.3-.9 8.1-2.7 9-9z" fill="currentColor" /><path d="M19 3.5c.3 2.1.9 2.7 3 3-2.1.3-2.7.9-3 3-.3-2.1-.9-2.7-3-3 2.1-.3 2.7-.9 3-3z" fill="currentColor" opacity=".7" /></symbol>
        <symbol id="i-back" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-fwd" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-down" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></symbol>
        <symbol id="i-play" viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" /></symbol>
        <symbol id="i-pause" viewBox="0 0 24 24"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" /><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" /></symbol>
        <symbol id="i-ext" viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></symbol>
        <symbol id="i-dice" viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="8.3" cy="8.3" r="1.4" fill="currentColor" /><circle cx="15.7" cy="15.7" r="1.4" fill="currentColor" /><circle cx="15.7" cy="8.3" r="1.4" fill="currentColor" /><circle cx="8.3" cy="15.7" r="1.4" fill="currentColor" /></symbol>
        <symbol id="i-target" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /></symbol>
        <symbol id="i-home" viewBox="0 0 24 24"><path d="M4 11.2 12 4l8 7.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M6.2 9.8V20h11.6V9.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-split" viewBox="0 0 24 24"><rect x="3.5" y="5" width="7" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /><rect x="13.5" y="5" width="7" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /></symbol>
        <symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M12 11v5.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="12" cy="7.8" r="1.3" fill="currentColor" /></symbol>
        <symbol id="i-dl" viewBox="0 0 24 24"><path d="M12 4v10.5M7.5 11 12 15.5 16.5 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M5 19.5h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></symbol>
        <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-sliders" viewBox="0 0 24 24"><path d="M4 7.5h16M4 16.5h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="15" cy="7.5" r="2.3" fill="currentColor" /><circle cx="9" cy="16.5" r="2.3" fill="currentColor" /></symbol>
        <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M12 3.5 19 20.5 12 16.8 5 20.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></symbol>
        <symbol id="i-team" viewBox="0 0 24 24"><circle cx="9" cy="8.5" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="16.8" cy="9.5" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M15.4 14.7c2.3.3 4 1.9 4.5 4.3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></symbol>
        <symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M3.5 12h17M12 3.5c2.6 2.3 3.9 5.2 3.9 8.5s-1.3 6.2-3.9 8.5c-2.6-2.3-3.9-5.2-3.9-8.5S9.4 5.8 12 3.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></symbol>
        <symbol id="i-mail" viewBox="0 0 24 24"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M4.5 7.5 12 13l7.5-5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-code" viewBox="0 0 24 24"><path d="M8.5 6.5 3.5 12l5 5.5M15.5 6.5l5 5.5-5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-github" viewBox="0 0 24 24"><path fill="currentColor" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />{/* CC0 Simple Icons octocat mark */}</symbol>
        <symbol id="i-briefcase" viewBox="0 0 24 24"><rect x="3.5" y="7.5" width="17" height="12.5" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 12.5h17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></symbol>
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

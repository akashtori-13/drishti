'use client';

import Link from 'next/link';
import Icon from '@/components/Icon';
import { useAppStore } from '@/lib/store';
import appPkg from '../../package.json';

function SettingRow({ label, desc, on, onToggle, controlLabel }: {
  label: string; desc: string; on: boolean; onToggle: () => void; controlLabel: string;
}) {
  return (
    <div className="set-row">
      <span className="set-text">
        <span className="set-label">{label}</span>
        <span className="set-desc">{desc}</span>
      </span>
      <button type="button" className="switch" role="switch" aria-checked={on}
        aria-label={controlLabel} onClick={onToggle} />
    </div>
  );
}

/** Settings: accessibility, playback, contact, and about — crew lives at /crew. */
export default function SettingsPage() {
  const colorblind = useAppStore((s) => s.colorblind);
  const setColorblind = useAppStore((s) => s.setColorblind);
  const autoplay = useAppStore((s) => s.autoplay);
  const setAutoplay = useAppStore((s) => s.setAutoplay);
  return (
    <div className="prose" style={{ position: 'relative', zIndex: 1 }}>
      <p className="hero-kicker">Tune the app</p>
      <h1>Settings</h1>

      <section aria-label="Accessibility">
        <h2 className="set-h">Accessibility</h2>
        <SettingRow
          label="Colorblind-friendly everywhere"
          desc="Locks thumbnails, previews, and colormaps to cividis."
          on={colorblind} onToggle={() => setColorblind(!colorblind)}
          controlLabel="Colorblind-friendly mode"
        />
      </section>

      <section aria-label="Playback">
        <h2 className="set-h">Playback</h2>
        <SettingRow
          label="Autoplay previews"
          desc="Animate artifact preview frames on open."
          on={autoplay} onToggle={() => setAutoplay(!autoplay)}
          controlLabel="Autoplay previews"
        />
      </section>

      <section aria-label="Contact">
        <h2 className="set-h">Contact</h2>
        <Link className="menu-link" href="/crew">
          <Icon name="team" className="icon" />
          <span className="menu-text">
            <span className="menu-label">The crew</span>
            <span className="menu-desc">Team AKASHTORI members and contacts</span>
          </span>
        </Link>
        <a className="menu-link" href="https://github.com/akashtori-13/drishti" target="_blank" rel="noreferrer">
          <Icon name="github" className="icon" />
          <span className="menu-text">
            <span className="menu-label">GitHub</span>
            <span className="menu-desc">Source, issues, and releases</span>
          </span>
        </a>
      </section>

      <section aria-label="About">
        <h2 className="set-h">About</h2>
        <Link className="menu-link" href="/mission">
          <Icon name="info" className="icon" />
          <span className="menu-text">
            <span className="menu-label">Mission</span>
            <span className="menu-desc">Method, data, and citation</span>
          </span>
        </Link>
        <p className="fine mono">DRISHTI {(appPkg as { version: string }).version} · data: NASA/JPL–Caltech SPHEREx via IRSA</p>
      </section>
    </div>
  );
}

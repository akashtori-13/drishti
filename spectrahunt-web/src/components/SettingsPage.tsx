'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { useAppStore } from '@/lib/store';
import {
  clearCloudAll, DEFAULT_CLOUD_MODEL, DEFAULT_CLOUD_URL,
  getCloudCfg, getCloudOptIn, keyLast4, setCloudCfg, setCloudKey, setCloudOptIn,
} from '@/lib/cloudGuide';
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

/** Optional cloud brain for Pip (BYO key). Key stays in this browser only. */
function CloudSettings() {
  const [cfg, setCfg] = useState(getCloudCfg);
  const [optIn, setOptIn] = useState(getCloudOptIn);
  const [url, setUrl] = useState(cfg.baseUrl);
  const [model, setModel] = useState(cfg.model);
  const [key, setKey] = useState('');
  const [note, setNote] = useState('');
  const save = () => {
    const clean = url.trim().replace(/\/$/, '') || DEFAULT_CLOUD_URL;
    if (!/^https:\/\//.test(clean) && !/^http:\/\/localhost/.test(clean)) {
      setNote('Endpoint must be https (http://localhost… allowed for local models).');
      return;
    }
    setCloudCfg(clean, model.trim() || DEFAULT_CLOUD_MODEL);
    if (key.trim()) { setCloudKey(key.trim()); setKey(''); }
    setCfg(getCloudCfg());
    setNote('Saved on this device only.');
  };
  return (
    <section aria-label="Cloud answers (optional)">
      <h2 className="set-h">Cloud answers (optional)</h2>
      <SettingRow
        label="Ask cloud with Pip"
        desc="Off by default. Each cloud ask sends your question + page context to your endpoint and may cost you per your provider."
        on={optIn}
        onToggle={() => { const v = !optIn; setCloudOptIn(v); setOptIn(v); }}
        controlLabel="Ask cloud with Pip"
      />
      <div className="set-row" style={{ display: 'grid', gap: 8 }}>
        <label className="mono" htmlFor="cloud-url" style={{ fontSize: 12 }}>Base URL (OpenAI-compatible)</label>
        <input id="cloud-url" className="guide-textin" value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder={DEFAULT_CLOUD_URL} autoComplete="off" spellCheck={false} inputMode="url" />
        <label className="mono" htmlFor="cloud-model" style={{ fontSize: 12 }}>Model</label>
        <input id="cloud-model" className="guide-textin" value={model} onChange={(e) => setModel(e.target.value)}
          placeholder={DEFAULT_CLOUD_MODEL} autoComplete="off" spellCheck={false} />
        <label className="mono" htmlFor="cloud-key" style={{ fontSize: 12 }}>API key {cfg.hasKey ? `(${keyLast4()})` : '(none saved)'}</label>
        <input id="cloud-key" className="guide-textin" type="password" value={key} onChange={(e) => setKey(e.target.value)}
          placeholder="sk-…" autoComplete="off" spellCheck={false} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="epoch-chip" onClick={save}>Save</button>
          <button type="button" className="epoch-chip" onClick={() => { clearCloudAll(); setCfg(getCloudCfg()); setOptIn(false); setNote('Cloud key removed from this device.'); }}>Remove key + erase Pip data</button>
        </div>
        {note && <span className="mono" role="status" style={{ fontSize: 12 }}>{note}</span>}
      </div>
    </section>
  );
}

/** Experimental features modal: Pip buddy + cloud answers. Focus-trapped. */
function ExperimentalModal({ onClose }: { onClose: () => void }) {
  const guideEnabled = useAppStore((s) => s.guideEnabled);
  const setGuideEnabled = useAppStore((s) => s.setGuideEnabled);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  useEffect(() => {
    prevFocus.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const els = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      try {
        if (prevFocus.current && document.contains(prevFocus.current)) {
          prevFocus.current.focus({ preventScroll: true });
        }
      } catch { /* noop */ }
    };
  }, [onClose]);
  if (!mounted) return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Experimental features" className="tut-veil"
      style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center', background: 'rgba(4,5,10,.72)', padding: 20 }}>
      <div ref={panelRef} tabIndex={-1} className="glass tut-panel"
        style={{ position: 'relative', maxWidth: 520, width: '100%', borderRadius: 20, padding: 28, outline: 'none' }}>
        <button type="button" onClick={onClose} aria-label="Close experimental features"
          style={{ position: 'absolute', top: 10, right: 12, background: 'none', border: 0, padding: '6px 8px', fontSize: 12, color: '#8a90ab', cursor: 'pointer' }}>
          Close
        </button>
        <p className="hero-kicker">Unstable helpers under test</p>
        <h2 style={{ fontSize: 22, margin: '8px 0 4px' }}>Experimental features</h2>
        <p className="set-desc">Off by default; nothing here affects your data.</p>
        <SettingRow
          label="Pip the sky buddy"
          desc="A parked alien guide. Explains pages, navigates on request, flips viewer settings."
          on={guideEnabled} onToggle={() => setGuideEnabled(!guideEnabled)}
          controlLabel="Pip the sky buddy (experimental)"
        />
        {guideEnabled && <CloudSettings />}
      </div>
    </div>,
    document.body,
  );
}

/** Settings: accessibility, playback, contact, and about — crew lives at /crew. */
export default function SettingsPage() {
  const colorblind = useAppStore((s) => s.colorblind);
  const setColorblind = useAppStore((s) => s.setColorblind);
  const autoplay = useAppStore((s) => s.autoplay);
  const setAutoplay = useAppStore((s) => s.setAutoplay);
  const [expOpen, setExpOpen] = useState(false);
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

      <section aria-label="Experimental features">
        <h2 className="set-h">Experimental</h2>
        <button type="button" className="menu-link" onClick={() => setExpOpen(true)}>
          <Icon name="sliders" className="icon" />
          <span className="menu-text">
            <span className="menu-label">Experimental features</span>
            <span className="menu-desc">Pip buddy, cloud answers — off by default</span>
          </span>
        </button>
      </section>

      {expOpen && <ExperimentalModal onClose={() => setExpOpen(false)} />}

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

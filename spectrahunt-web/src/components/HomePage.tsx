'use client';

import Link from 'next/link';
import { Reveal } from '@/lib/reveal';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { SHOWCASE_IDS, getCoverage, getShowcase, useLive, type RealCell, type Showcase } from '@/lib/showcases';
import { BANDS, buildGrid, GRID_H, GRID_W, nearestShowcase, SHOWCASE_POINTS } from '@/lib/sky';
import { CHANNELS } from '@/lib/astro';
import HeroSky from '@/components/HeroSky';
import SearchBox, { type SearchTarget } from '@/components/SearchBox';
import SurpriseButton from '@/components/SurpriseButton';
import OrbitHero from '@/components/orbital/OrbitHero';
import Inspector, { type InspectorField } from '@/components/Inspector';
import FlickerNumber from '@/components/FlickerNumber';

function fieldFromRaDec(ra: number, dec: number, grid: number[][], real?: Map<string, RealCell>): InspectorField {
  const i = Math.min(GRID_W - 1, Math.max(0, Math.floor((ra / 360) * GRID_W)));
  const j = Math.min(GRID_H - 1, Math.max(0, Math.floor(((90 - dec) / 180) * GRID_H)));
  const hit = real?.get(`${i},${j}`);
  if (hit) {
    return {
      ra, dec, epochs: hit.epochs,
      bands: hit.bands,
      survey: hit.showcase === 'nep-deep' ? 'Deep' : 'Wide',
      hasCandidate: hit.showcase === '3i-atlas',
      planning: 'QR2 · weekly releases',
      detector: 1 + (i + j) % 6,
      measured: true,
    };
  }
  return {
    ra, dec, epochs: 0, bands: 0, survey: '—',
    hasCandidate: false, planning: 'Not yet surveyed', detector: '—',
    measured: false,
  };
}

/** Where every pixel comes from: eight source cards with honest status. */
function SourcesSection() {
  const sources = [
    { name: 'SPHEREx QR2', contrib: 'All-sky infrared visits — our core imagery', status: 'live' },
    { name: 'DSS2', contrib: 'Optical context frames per field', status: 'synced' },
    { name: '2MASS', contrib: 'Near-infrared context frames', status: 'synced' },
    { name: 'Gaia DR3', contrib: 'Precision astrometry for cross-matching', status: 'live' },
    { name: 'SIMBAD', contrib: 'Object names, types, and references', status: 'live' },
    { name: 'SkyBoT', contrib: 'Asteroid positions at exposure time', status: 'degraded' },
    { name: 'Horizons', contrib: 'Ephemerides and verification links', status: 'live' },
    { name: 'CelesTrak', contrib: 'Orbital elements for the live orbit view', status: 'synced' },
  ] as const;
  return (
    <section className="sources" aria-labelledby="sources-h">
      <div className="sources-inner">
        <Reveal index={0}>
          <p className="hero-kicker">Where every pixel comes from</p>
          <h2 id="sources-h">Eight sources, one sky</h2>
          <p className="sources-lead">Every image, number, and candidate traces to these archives — live where possible, honestly labeled where degraded.</p>
        </Reveal>
        <ul className="source-grid">
          {sources.map((s) => (
            <li key={s.name} className="source-card">
              <span className="source-head">
                <span className={`src-dot ${s.status}`} aria-hidden="true" />
                <span className="source-name">{s.name}</span>
                <span className={`source-status ${s.status}`}>{s.status}</span>
              </span>
              <span className="source-contrib">{s.contrib}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function HomePage() {  const router = useRouter();
  const openPreview = useAppStore((s) => s.openPreview);
  const [, setConsoleMode] = useState(false);
  const [wake, setWake] = useState(false);
  const [toast, setToast] = useState(false);
  // No globe on small phones: saves data, battery, and a 320px-tall canvas
  // nobody asked for (matches the CSS that would shrink it anyway).
  const [hideGlobe, setHideGlobe] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const apply = () => setHideGlobe(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  const heroRef = useRef<HTMLElement | null>(null);
  const copyRef = useRef<HTMLDivElement | null>(null);
  const orbitRef = useRef<HTMLDivElement | null>(null);

  // Onboarding gate: exactly one thing happens per arrival, in order.
  // - Entry is persistent (localStorage): mobile OSes wipe session storage
  //   when background tabs die, which used to replay the intro "sometimes".
  // - Coarse pointers / slow networks skip the heavy orbital intro and land
  //   on home directly (intro stays opt-in at /intro).
  // - Post-entry, the tutorial and the toast never compete: first-timers get
  //   the tutorial only; returners get the toast (once ever) only.
  useEffect(() => {
    const entered = () => {
      try {
        return localStorage.getItem('sh-entered-v1') === '1'
          || sessionStorage.getItem('sh-entered') === '1';
      } catch {
        return true; // private mode: plain home, no gate
      }
    };
    const remember = (k: string) => {
      try {
        if (!localStorage.getItem(k)) {
          localStorage.setItem(k, '1');
          return true; // first time seeing this
        }
        return false;
      } catch {
        return false;
      }
    };
    if (!entered()) {
      let skipIntro = false;
      try {
        const conn = navigator as Navigator & {
          connection?: { saveData?: boolean; effectiveType?: string };
        };
        skipIntro = window.matchMedia('(pointer: coarse)').matches
          || window.innerWidth < 640
          || conn.connection?.saveData === true
          || /2g/.test(conn.connection?.effectiveType ?? '');
      } catch { /* assume desktop path */ }
      if (skipIntro) {
        try {
          localStorage.setItem('sh-entered-v1', '1');
          sessionStorage.setItem('sh-entered', '1');
        } catch { /* noop */ }
      } else {
        router.replace('/intro');
        return;
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConsoleMode(true);
    if (remember('sh-wake-done')) {
      setWake(true);
    }
    // Tutorial (first-timers) and toast (returners) are mutually exclusive —
    // they used to fire together and fight for the tap.
    const tutDone = useAppStore.getState().tutorialDone;
    if (tutDone) {
      if (remember('sh-toast-shown')) {
        setToast(true);
      }
    } else {
      remember('sh-toast-shown'); // consume: the tutorial owns this visit
    }
  }, [router]);
  const grid = useMemo(() => {
    const g = buildGrid();
    return g;
  }, []);
  const [coverage, setCoverage] = useState(false);
  const [field, setField] = useState<InspectorField | null>(null);
  const [real, setReal] = useState<Map<string, RealCell> | null>(null);
  const [fields, setFields] = useState<Showcase[]>([]);

  useEffect(() => {
    let alive = true;
    void getCoverage().then((c) => {
      if (!alive || !c) return;
      const m = new Map<string, RealCell>();
      for (const [k, v] of Object.entries(c.cells)) {
        m.set(k, v);
        const [i, j] = k.split(',').map(Number);
        if (Number.isInteger(i) && Number.isInteger(j)) grid[j][i] = Math.min(v.epochs, 5);
      }
      setReal(m);
    });
    void Promise.all(SHOWCASE_IDS.map((id) => getShowcase(id).catch(() => null))).then((docs) => {
      if (alive) setFields(docs.filter((d): d is Showcase => d !== null));
    });
    return () => { alive = false; };
  }, [grid]);

  // Hero parallax: pointer steers .hero-copy ±6px and .hero-orbit ∓4px.
  // translate-only (wake choreography owns transform), rAF-coalesced,
  // fine pointers only, off under reduced-motion.
  useEffect(() => {
    const hero = heroRef.current;
    const copy = copyRef.current;
    const orbit = orbitRef.current;
    if (!hero || !copy || !orbit) return;
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    } catch {
      return;
    }
    let raf = 0;
    let nx = 0;
    let ny = 0;
    const render = () => {
      raf = 0;
      copy.style.translate = `${(nx * 6).toFixed(2)}px ${(ny * 6).toFixed(2)}px`;
      orbit.style.translate = `${(nx * -4).toFixed(2)}px ${(ny * -4).toFixed(2)}px`;
    };
    const onMove = (e: PointerEvent) => {
      const r = hero.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(render);
    };
    const onLeave = () => {
      nx = 0;
      ny = 0;
      if (!raf) raf = requestAnimationFrame(render);
    };
    hero.addEventListener('pointermove', onMove, { passive: true });
    hero.addEventListener('pointerleave', onLeave);
    return () => {
      hero.removeEventListener('pointermove', onMove);
      hero.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
      copy.style.translate = '';
      orbit.style.translate = '';
    };
  }, []);

  // '/' focuses search anywhere on the page (unless typing already)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      e.preventDefault();
      document.getElementById('hs-input')?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > window.innerHeight * 0.5) setField(null);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const pick = (t: SearchTarget) => {
    if (t.showcaseId) { openPreview(t.showcaseId); return; }
    const near = nearestShowcase(t.ra, t.dec);
    if (near) { openPreview(near); return; }
    try {
      sessionStorage.setItem('sh-target', JSON.stringify({ ra: t.ra, dec: t.dec }));
    } catch { /* noop */ }
    router.push('/sky');
  };

  const cutouts = fields.flatMap((f) => f.epochs).filter((e) => e.png).length;

  const dismissToast = () => {
    setToast(false);
    try {
      localStorage.setItem('sh-toast-shown', '1');
    } catch { /* noop */ }
  };

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(dismissToast, 6500);
    return () => window.clearTimeout(t);
  }, [toast]);

  return (
    <div>
      <section ref={heroRef} className={wake ? 'hero wake' : 'hero'} id="hero">
        <HeroSky grid={grid} coverage={coverage}
          markers={SHOWCASE_POINTS}
          onMarker={(id) => openPreview(id)}
          onInspect={(ra, dec) => setField(fieldFromRaDec(ra, dec, grid, real ?? undefined))} />
        <div className="hero-scrim" />

        <div className="hero-columns">
          <div ref={copyRef} className="hero-copy">
            <h1>Hunt what moves in the infrared sky</h1>

            <SearchBox
              id="hs" placeholder="Search an object, field, or coordinates"
              onPick={pick}
            />

            <div className="quick">
              <button type="button" className="chip" onClick={() => openPreview('3i-atlas')}>3I/ATLAS</button>
              <button type="button" className="chip" onClick={() => openPreview('galactic-center')}>Galactic Center</button>
              <button type="button" className="chip" onClick={() => pick({ label: 'Orion Complex', ra: 83.82, dec: -5.39 })}>Orion Complex</button>
              <span className="quick-sep" aria-hidden="true">·</span>
              <SurpriseButton onPick={pick} />
            </div>
          </div>

          {!hideGlobe && (
            <div ref={orbitRef} className="hero-orbit">
              <OrbitHero />
            </div>
          )}
        </div>

        <p className="credits" aria-label="Data sources">
          <span className="credits-group"><span className="credits-role">Imaging</span><span>DSS2 · 2MASS · SPHEREx QR2</span></span>
          <span className="credits-group"><span className="credits-role">Astrometry</span><span>Gaia DR3</span></span>
          <span className="credits-group"><span className="credits-role">Catalogs</span><span>SIMBAD · Yale BSC</span></span>
          <span className="credits-group"><span className="credits-role">Tracking</span><span>SkyBoT · Horizons · CelesTrak</span></span>
        </p>
      </section>

      <section className="fields" id="fields" aria-labelledby="fields-h">
        <div className="fields-inner">
          <div className="fields-head">
            <Reveal index={0}><div>
              <h2 id="fields-h">{SHOWCASE_IDS.length} fields, ready to blink</h2>
              <p>Every card is real SPHEREx data — two or more visits, same band. Pick one and press play.</p>
            </div></Reveal>
            <Reveal index={1}><Link href="/sky" className="btn">Open the sky map</Link></Reveal>
          </div>
          <div className="fields-rail" role="list">
            {fields.map((f) => {
              const png = f.epochs.find((e) => e.png)?.png ?? null;
              return (
                <button key={f.id} type="button" onClick={() => openPreview(f.id)} className="field-card" role="listitem"
                  aria-label={`${f.title}, ${f.epochs.length} epochs`}>
                  <span className="field-thumb">
                    {png ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={png} alt="" loading="lazy" draggable={false} />
                    ) : (
                      <span className="field-pending">cutout pending</span>
                    )}
                    <span className="field-epochs mono">{f.epochs.length} epochs</span>
                  </span>
                  <span className="field-body">
                    <span className="field-name">{f.title}</span>
                    <span className="field-meta mono">D{f.epochs[0]?.band ?? 3} · {f.epochs[0]?.wavelength_um?.toFixed(2) ?? '—'} µm</span>
                  </span>
                </button>
              );
            })}
            {!fields.length && (
              <p className="empty">Loading fields…</p>
            )}
          </div>
        </div>
      </section>

      <SourcesSection />

      <section className="nums" aria-label="By the numbers">
        <div className="nums-inner">
          <Reveal index={0}><div className="num">
            <span className="num-n"><FlickerNumber value={real ? real.size : '—'} /></span>
            <span className="num-l">sky cells measured</span>
          </div></Reveal>
          <Reveal index={1}><div className="num">
            <span className="num-n"><FlickerNumber value={fields.length ? cutouts : '—'} /></span>
            <span className="num-l">epoch cutouts rendered</span>
          </div></Reveal>
          <Reveal index={2}><div className="num">
            <span className="num-n"><FlickerNumber value={CHANNELS.length} /></span>
            <span className="num-l">spectral bands, 0.75–5 µm</span>
          </div></Reveal>
          <Reveal index={3}><div className="num">
            <span className="num-n"><FlickerNumber value={BANDS.length} /></span>
            <span className="num-l">detectors, same-band blinks</span>
          </div></Reveal>
        </div>
      </section>

      <section className="how" id="how" aria-labelledby="how-h">
        <div className="how-inner">
          <h2 id="how-h">How STELLAR spots something that moves</h2>
          <p className="how-lead">Every field is compared with itself across visits. Stars stay put. Anything else shows up in the difference.</p>

          <ol className="steps">
            <li>
              <Reveal index={0}>
                <figure className="step-fig">
                  <svg viewBox="0 0 240 150" role="img" aria-label="Two sets of stars, offset slightly, being lined up">
                    <g fill="#dfe3f2"><circle cx="40" cy="40" r="3" /><circle cx="90" cy="98" r="2.2" /><circle cx="150" cy="52" r="3.2" /><circle cx="196" cy="112" r="2.4" /><circle cx="122" cy="26" r="1.8" /><circle cx="62" cy="118" r="2.6" /></g>
                    <g fill="none" stroke="#5aa9e6" strokeWidth="1.4"><circle cx="49" cy="46" r="4.6" /><circle cx="99" cy="104" r="4" /><circle cx="159" cy="58" r="4.8" /><circle cx="205" cy="118" r="4.2" /><circle cx="131" cy="32" r="3.6" /><circle cx="71" cy="124" r="4.4" /></g>
                    <g stroke="rgba(238,240,248,.3)" strokeWidth="1" strokeDasharray="2 3"><path d="M43 42l3 2M92 100l4 3M153 54l4 3M198 113l4 3M124 28l4 3M65 120l4 3" /></g>
                  </svg>
                </figure>
                <div className="step-head"><span className="step-n">1</span><h3>Align the passes</h3></div>
                <p>Each visit to a field is registered to a common pixel grid and background-subtracted.</p>
              </Reveal>
            </li>
            <li>
              <Reveal index={1}>
                <figure className="step-fig">
                  <svg viewBox="0 0 240 150" role="img" aria-label="Faded stars with one bright spot paired with a dark spot">
                    <g fill="#dfe3f2" opacity=".16"><circle cx="40" cy="40" r="3" /><circle cx="90" cy="98" r="2.2" /><circle cx="150" cy="52" r="3.2" /><circle cx="196" cy="112" r="2.4" /><circle cx="62" cy="118" r="2.6" /></g>
                    <circle cx="146" cy="70" r="16" fill="#f08a4b" opacity=".22" />
                    <circle cx="146" cy="70" r="5.5" fill="#fff" />
                    <circle cx="102" cy="88" r="5.5" fill="#04050a" stroke="rgba(238,240,248,.6)" strokeWidth="1.4" strokeDasharray="3 3" />
                    <path d="M110 85l28-12" stroke="rgba(238,240,248,.4)" strokeWidth="1.2" strokeDasharray="2 4" />
                  </svg>
                </figure>
                <div className="step-head"><span className="step-n">2</span><h3>Subtract one from the other</h3></div>
                <p>Stationary stars cancel out. A mover leaves a paired bright and dark spot: where it is, and where it was.</p>
              </Reveal>
            </li>
            <li>
              <Reveal index={2}>
                <figure className="step-fig">
                  <svg viewBox="0 0 240 150" role="img" aria-label="A bright dot inside a dashed circle marking a catalog match radius">
                    <g fill="#dfe3f2" opacity=".16"><circle cx="40" cy="40" r="3" /><circle cx="190" cy="34" r="2.2" /><circle cx="200" cy="112" r="3" /><circle cx="52" cy="112" r="2.4" /></g>
                    <circle cx="120" cy="75" r="15" fill="#f08a4b" opacity=".22" />
                    <circle cx="120" cy="75" r="5" fill="#fff" />
                    <circle cx="120" cy="75" r="26" fill="none" stroke="#5fcf9a" strokeWidth="1.4" strokeDasharray="4 4" />
                    <path d="M120 40v9M120 101v9M85 75h9M146 75h9" stroke="rgba(238,240,248,.55)" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                </figure>
                <div className="step-head"><span className="step-n">3</span><h3>Check the catalogs</h3></div>
                <p>Every candidate is cross-matched against Gaia stars and known solar-system objects. Anything without a match goes to a person for review.</p>
              </Reveal>
            </li>
          </ol>

          <div className="how-cta">
            <button type="button" className="btn primary" onClick={() => router.push('/sky')}>Open the sky map</button>
            <button type="button" className="btn" onClick={() => router.push('/candidates')}>See this week&apos;s candidates</button>
          </div>
        </div>
      </section>

      {toast && (
        <div className="orbital-toast glass" role="status">
          <span>You are looking at the actual survey sky. Click anywhere.</span>
          <button type="button" className="icon-btn" aria-label="Dismiss" onClick={dismissToast}>
            ×
          </button>
        </div>
      )}

      <Inspector
        field={field} blinkId={field ? (nearestShowcase(field.ra, field.dec) ?? (useLive && field.epochs >= 2 ? 'live' : null)) : null}
        onClose={() => setField(null)}
        onOpenBlink={() => {
          if (field) {
            const id = nearestShowcase(field.ra, field.dec);
            if (id) openPreview(id);
            else if (useLive && field.epochs >= 2) router.push(`/blink/live?ra=${field.ra.toFixed(3)}&dec=${field.dec.toFixed(3)}&band=3`);
          }
          setField(null);
        }}
      />
    </div>
  );
}

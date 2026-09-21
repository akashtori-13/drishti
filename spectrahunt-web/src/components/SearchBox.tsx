'use client';

import { useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { SHOWCASE_IDS, getShowcase, resolveQuery, type Showcase } from '@/lib/showcases';

export interface SearchTarget {
  label: string;
  ra: number;
  dec: number;
  showcaseId?: string;
}

interface Suggestion {
  group: string;
  name: string;
  meta: string;
  run: () => Promise<SearchTarget | null>;
  error?: string;
}

/** Combobox search: showcases, coordinates, live resolve. Shared by hero + sky. */
export default function SearchBox({
  id, placeholder, compact = false, onPick,
}: {
  id: string; placeholder: string; compact?: boolean;
  onPick: (t: SearchTarget) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(-1);
  const [err, setErr] = useState<string | null>(null);
  const [opts, setOpts] = useState<Suggestion[]>([]);
  const boxRef = useRef<HTMLFormElement>(null);

  const build = (value: string): Suggestion[] => {
    const out: Suggestion[] = [];
    const query = value.trim().toLowerCase();
    const coord = value.match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
    if (coord) {
      const ra = parseFloat(coord[1]);
      const dec = parseFloat(coord[2]);
      out.push({
        group: 'Coordinates', name: `Go to RA ${ra}, Dec ${dec}`, meta: 'position',
        run: async () => {
          const hit = await resolveQuery(value.trim());
          return hit ? { label: value.trim(), ra: hit.ra, dec: hit.dec } : null;
        },
      });
    }
    const matches = SHOWCASE_IDS.filter((s) => !query || s.replace(/-/g, ' ').includes(query));
    for (const sid of matches) {
      out.push({
        group: 'Showcases', name: sid.replace(/-/g, ' '), meta: 'blink',
        run: async () => {
          const d: Showcase = await getShowcase(sid);
          return { label: d.title, ra: d.ra, dec: d.dec, showcaseId: sid };
        },
      });
    }
    const fixed = [
      { name: 'Ecliptic plane', meta: '0.00, 0.00', ra: 0, dec: 0 },
      { name: 'Orion Complex', meta: '83.82, −5.39', ra: 83.82, dec: -5.39 },
    ].filter((f) => !query || f.name.toLowerCase().includes(query));
    for (const f of fixed) {
      out.push({
        group: 'Notable fields', name: f.name, meta: f.meta,
        run: async () => ({ label: f.name, ra: f.ra, dec: f.dec }),
      });
    }
    return out;
  };

  const submit = async (value: string) => {
    const list = build(value);
    if (!list.length) {
      const hit = await resolveQuery(value);
      if (hit) { onPick({ label: value, ra: hit.ra, dec: hit.dec }); setOpen(false); return; }
      setErr(`No match for "${value}". Try a showcase or coordinates like 132.40, −3.20.`);
      setOpen(true);
      return;
    }
    const pick = hl >= 0 ? list[Math.min(hl, list.length - 1)] : list[0];
    const t = await pick.run();
    if (!t) { setErr('That field has no blinkable epochs yet.'); setOpen(true); return; }
    setErr(null); setOpen(false);
    onPick(t);
  };

  return (
    <form
      ref={boxRef} className="search-shell" role="search" noValidate
      onSubmit={(e) => { e.preventDefault(); void submit(q); }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}
    >
      <Icon name="search" className="s-icon icon" />
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpts(build(e.target.value)); setHl(-1); setErr(null); setOpen(true); }}
        onFocus={() => { setOpts(build(q)); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHl((h) => Math.min(h + 1, opts.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHl((h) => Math.max(h - 1, -1)); }
          else if (e.key === 'Escape') { setOpen(false); }
        }}
        role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
        placeholder={placeholder} aria-label={placeholder}
        autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="search"
      />
      {!compact && <kbd className="s-kbd" aria-hidden="true">/</kbd>}
      <button type="submit" className="s-go">
        <Icon name="search" className="s-go-icon icon" />
        <span className="s-go-label">{compact ? 'Go' : 'Search'}</span>
      </button>
      <div className={`s-list${open ? ' open' : ''}`} id={`${id}-list`} role="listbox" aria-label="Suggestions">
        {err && <div className="s-empty" role="alert">{err}</div>}
        {!err && opts.map((o, i) => (
          <div key={`${o.group}-${o.name}`}>
            {(i === 0 || opts[i - 1].group !== o.group) && <div className="s-group">{o.group}</div>}
            <div
              className={`opt${i === hl ? ' hl' : ''}`} role="option" aria-selected={i === hl}
              onMouseDown={(e) => {
                e.preventDefault();
                void o.run().then((t) => {
                  if (!t) { setErr('That field has no blinkable epochs yet.'); return; }
                  setOpen(false); onPick(t);
                });
              }}
              onMouseEnter={() => setHl(i)}
            >
              <span>{o.name}</span><span className="o-meta">{o.meta}</span>
            </div>
          </div>
        ))}
        {!err && !opts.length && <div className="s-empty">No suggestions. Press Enter to try anyway.</div>}
      </div>
    </form>
  );
}

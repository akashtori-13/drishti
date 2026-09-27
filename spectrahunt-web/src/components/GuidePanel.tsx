'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { answerGuide, summarizeBlink, type GuideAction, type GuideContext } from '@/lib/guide';
import { SHOWCASE_IDS } from '@/lib/showcases';
import {
  askCloud, getCloudCfg, getCloudOptIn,
} from '@/lib/cloudGuide';
import { useAppStore } from '@/lib/store';
import { blinkURL } from '@/lib/store';
import { PipArt } from '@/components/GuideMascot';

interface Msg {
  who: 'pip' | 'you';
  text: string;
  chips?: string[];
  source?: 'local' | 'cloud';
  key: number;
}

interface Snapshot {
  compareMode: string;
  band: number;
  epochIdx: number;
  showMarkers: boolean;
  colorblind: boolean;
  autoplay: boolean;
  entryCmap: string | null;
  label: string;
}

const NAV_RE = /^\/(sky|candidates|mission|crew|about|intro)?$|^\/blink\/live$|^\/blink\/[a-z0-9-]+$/;

function routeChips(route: string, hasShowcase: boolean): string[] {
  if (route.startsWith('/blink')) return hasShowcase ? ['What am I looking at?', 'Turn on Difference mode'] : ['Take me to 3I/ATLAS'];
  if (route === '/sky') return ['What am I looking at?', 'Take me to Orion'];
  return ['What can you do?', 'Take me to the sky', 'Where does the data come from?'];
}

function greetingFor(route: string, showcase: GuideContext['showcase'], compareMode: GuideContext['compareMode']): { text: string; chips: string[] } | null {
  if (showcase) {
    return { text: summarizeBlink(showcase, compareMode), chips: ['Turn on Difference mode'] };
  }
  return { text: 'Hi, I\u2019m Pip. Ask me to take you somewhere, explain a page, or flip a setting.', chips: routeChips(route, false) };
}

/** Non-modal chat dialog for Pip. Escape closes; focus returns to the mascot. */
export default function GuidePanel() {
  const router = useRouter();
  const pathname = usePathname();
  const enabled = useAppStore((s) => s.guideEnabled);
  const open = useAppStore((s) => s.guideOpen);
  const setOpen = useAppStore((s) => s.setGuideOpen);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [cloudOn, setCloudOn] = useState(false);
  const [confirmCloud, setConfirmCloud] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const undoRef = useRef<Snapshot | null>(null);
  const keySeq = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const fabEl = useRef<HTMLElement | null>(null);
  const st = useAppStore();
  const showcaseId = st.guideShowcase?.id ?? null;

  const nextKey = () => { keySeq.current += 1; return keySeq.current; };

  // Self-greeting on open when the thread is empty. Appends (never drops)
  // when a new showcase arrives mid-thread; marks first-visit seen on read.
  useEffect(() => {
    if (!open) return;
    const g = useAppStore.getState();
    const sc = g.guideShowcase;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMsgs((m) => {
      if (m.length > 0) {
        let lastSc: string | null = null;
        for (let i = m.length - 1; i >= 0; i--) {
          const x = m[i] as Msg & { scId?: string | null };
          if (x.who === 'pip' && 'scId' in x) { lastSc = x.scId ?? null; break; }
        }
        if (sc && lastSc !== sc.id) {
          const greet = greetingFor(window.location.pathname, sc, g.compareMode);
          if (greet) {
            if (!g.guideBlinkSeen.includes(sc.id)) g.markGuideBlinkSeen(sc.id);
            return [...m, { who: 'pip', text: greet.text, chips: greet.chips, source: 'local' as const, key: keySeq.current + 1, scId: sc.id } as Msg];
          }
        }
        return m;
      }
      const greet = greetingFor(window.location.pathname, sc, g.compareMode);
      if (!greet) return m;
      if (sc && !g.guideBlinkSeen.includes(sc.id)) g.markGuideBlinkSeen(sc.id);
      return [{ who: 'pip', text: greet.text, chips: greet.chips, source: 'local' as const, key: 1, scId: sc?.id ?? null } as Msg];
    });
    inputRef.current?.focus({ preventScroll: true });
    fabEl.current = document.getElementById('pip-fab');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, showcaseId]);

  // Keep latest message visible.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [msgs, open ]);

  // Escape closes (yields to open modals); focus returns to the mascot.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('.tut-veil')) return;
      e.preventDefault();
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  // Return focus on unmount / disable while open.
  useEffect(() => {
    if (open && enabled) return;
    const fab = document.getElementById('pip-fab');
    if (fab && document.activeElement?.closest('.guide-panel')) {
      try { fab.focus({ preventScroll: true }); } catch { /* noop */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, enabled]);

  if (!enabled || !open) return null;

  const ctx: GuideContext = {
    route: pathname,
    showcase: st.guideShowcase,
    compareMode: st.compareMode,
    epochIdx: st.epochIdx,
    band: st.band,
    entryCmap: st.entryCmap,
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    toggles: { colorblind: st.colorblind, autoplay: st.autoplay, showMarkers: st.showMarkers },
  };

  const snapshot = (label: string): Snapshot => ({
    compareMode: st.compareMode,
    band: st.band,
    epochIdx: st.epochIdx,
    showMarkers: st.showMarkers,
    colorblind: st.colorblind,
    autoplay: st.autoplay,
    entryCmap: st.entryCmap,
    label,
  });

  const runAction = (a: GuideAction): string | null => {
    const g = useAppStore.getState();
    switch (a.kind) {
      case 'navigate':
        if (!NAV_RE.test(a.href)) return 'I can\u2019t go there — try the sky, a featured field, mission, crew, or settings.';
        if (a.href.startsWith('/blink/') && a.href !== '/blink/live') {
          const id = decodeURIComponent(a.href.split('/')[2].split('?')[0]);
          if (!(SHOWCASE_IDS as readonly string[]).includes(id)) {
            return 'That field isn\u2019t charted — try the sky map or a featured field.';
          }
        }
        if (a.href.startsWith('/blink/') && !a.href.startsWith('/blink/live') && a.href !== `/blink/${g.guideShowcase?.id ?? ''}`) {
          // Carry viewer state blink→blink via shareable URL.
          const cur = g.guideShowcase ? { band: g.band, epoch: g.epochIdx, mode: g.compareMode } : {};
          const id = decodeURIComponent(a.href.split('/')[2].split('?')[0]);
          router.push(`${blinkURL(id, cur as { band?: number; epoch?: number; mode?: typeof cur.mode })}`);
        } else {
          router.push(a.href);
        }
        return null;
      case 'preview': {
        if (!(SHOWCASE_IDS as readonly string[]).includes(a.id)) return 'That preview isn\u2019t charted.';
        g.openPreview(a.id);
        return 'Opening preview.';
      }
      case 'mode':
        undoRef.current = snapshot(`mode ${a.mode}`);
        g.setCompareMode(a.mode);
        return null;
      case 'band':
        undoRef.current = snapshot(`band ${a.band}`);
        g.setBand(a.band);
        return null;
      case 'epoch': {
        undoRef.current = snapshot('epoch');
        const n = g.guideShowcase?.epochs ?? 0;
        if (a.epoch === 'first') { g.setEpochIdx(0); return null; }
        if (a.epoch === 'last') { if (n > 0) g.setEpochIdx(n - 1); return null; }
        if (a.epoch === 'next') { if (n > 0) g.setEpochIdx(Math.min(g.epochIdx + 1, n - 1)); return null; }
        if (a.epoch === 'prev') { g.setEpochIdx(Math.max(0, g.epochIdx - 1)); return null; }
        g.setEpochIdx(Math.max(0, n > 0 ? Math.min(a.epoch, n - 1) : a.epoch));
        return null;
      }
      case 'toggle':
        undoRef.current = snapshot(a.key);
        if (a.key === 'colorblind') g.setColorblind(a.value ?? !g.colorblind);
        else if (a.key === 'autoplay') g.setAutoplay(a.value ?? !g.autoplay);
        else g.setShowMarkers(a.value ?? !g.showMarkers);
        return null;
      case 'cmap':
        undoRef.current = snapshot('colormap');
        g.setEntryCmap(a.cmap as Parameters<typeof g.setEntryCmap>[0]);
        return null;
      case 'none':
        return null;
    }
  };

  const push = (m: Omit<Msg, 'key'>) => setMsgs((prev) => [...prev, { ...m, key: nextKey() }]);

  const doUndo = () => {
    const snap = undoRef.current;
    if (!snap) {
      push({ who: 'pip', text: 'Nothing to undo — I haven\u2019t changed a setting yet. Try "turn on Difference mode".', source: 'local' });
      return;
    }
    const g = useAppStore.getState();
    g.setCompareMode(snap.compareMode as typeof g.compareMode);
    g.setBand(snap.band);
    g.setEpochIdx(snap.epochIdx);
    g.setShowMarkers(snap.showMarkers);
    g.setColorblind(snap.colorblind);
    g.setAutoplay(snap.autoplay);
    g.setEntryCmap(snap.entryCmap as Parameters<typeof g.setEntryCmap>[0]);
    undoRef.current = null;
    push({ who: 'pip', text: `Done — Undid that (${snap.label}).`, source: 'local' });
  };

  const sendLocal = (q: string) => {
    const reply = answerGuide(q, ctx);
    const notes: string[] = [];
    for (const a of reply.actions) {
      const note = runAction(a);
      if (note) notes.push(note);
    }
    const full = notes.length > 0 ? `${reply.text} ${notes.join(' ')}` : reply.text;
    push({ who: 'pip', text: full, chips: reply.chips, source: 'local' });
  };

  const send = (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    if (/^(undo|revert|go back)\b/.test(q.toLowerCase())) {
      push({ who: 'you', text: q });
      setInput('');
      doUndo();
      return;
    }
    // Cloud path: explicit toggle + key + per-message confirm.
    if (cloudOn) {
      const cfg = getCloudCfg();
      if (!cfg.hasKey || !getCloudOptIn()) {
        push({ who: 'you', text: q });
        setInput('');
        push({ who: 'pip', text: 'Cloud isn\u2019t set up — add a key in Settings to use it. Answering locally instead.', source: 'local', chips: ['Where does the data come from?'] });
        sendLocal(q);
        return;
      }
      setConfirmCloud(q);
      return;
    }
    push({ who: 'you', text: q });
    setInput('');
    sendLocal(q);
    inputRef.current?.focus({ preventScroll: true });
  };

  const sendCloud = async (q: string) => {
    setConfirmCloud(null);
    push({ who: 'you', text: q });
    setInput('');
    setBusy(true);
    try {
      const text = await askCloud(q, {
        route: ctx.route,
        fieldId: ctx.showcase?.id ?? null,
        fieldTitle: ctx.showcase?.title ?? null,
        epochs: ctx.showcase?.epochs ?? 0,
        bands: ctx.showcase?.bands ?? [],
        compareMode: ctx.compareMode,
      });
      const cfg = getCloudCfg();
      push({ who: 'pip', text, source: 'cloud', chips: [`cloud · ${cfg.model} · not stored`] });
    } catch {
      push({ who: 'pip', text: 'Cloud unreachable — answered locally instead.', source: 'local' });
      sendLocal(q);
    } finally {
      setBusy(false);
      inputRef.current?.focus({ preventScroll: true });
    }
  };

  const cfg = getCloudCfg();
  const lastPipIdx = msgs.map((m, i) => (m.who === 'pip' ? i : -1)).filter((i) => i >= 0).pop() ?? -1;

  return (
    <section className="guide-panel" role="dialog" aria-label="Pip the guide" aria-modal="false" id="guide-panel">
      <header className="guide-head">
        <PipArt size={36} />
        <div className="guide-title">
          <strong>Pip</strong>
          <span className="mono">local guide · answers from app data</span>
        </div>
        <button
          type="button"
          className="epoch-chip"
          aria-label="Close guide"
          onClick={() => {
            setOpen(false);
            document.getElementById('pip-fab')?.focus({ preventScroll: true });
          }}
        >✕</button>
      </header>
      <div ref={logRef} className="guide-log" role="log" aria-live="polite" aria-atomic="false" aria-label="Conversation with Pip">
        {msgs.map((m, i) => (
          <div key={m.key} className={`guide-msg ${m.who}`}>
            {m.who === 'pip' && <PipArt size={28} />}
            <div className="guide-bubble">
              <p>{m.text}</p>
              {m.who === 'pip' && m.source === 'cloud' && <span className="guide-src">cloud · not stored</span>}
              {m.who === 'pip' && m.chips && m.chips.length > 0 && i === lastPipIdx && (
                <div className="guide-chips">
                  {m.chips.map((c) => (
                    <button key={c} type="button" className="epoch-chip" onClick={() => send(c)}>{c}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {confirmCloud !== null && (
        <div className="guide-confirm" role="alertdialog" aria-label="Confirm cloud send">
          <p className="mono">Send to {cfg.baseUrl.replace(/^https?:\/\//, '')} · {cfg.model}? Your provider may charge you.</p>
          <div className="guide-chips">
            <button type="button" className="epoch-chip" onClick={() => sendCloud(confirmCloud)}>Send once</button>
            <button type="button" className="epoch-chip" onClick={() => setConfirmCloud(null)}>Cancel</button>
          </div>
        </div>
      )}
      <form className="guide-form" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <label className="sr-only" htmlFor="guide-input">Ask Pip</label>
        <input
          id="guide-input"
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Take me to… / what is this? / turn on…"
          autoComplete="off"
          maxLength={200}
          disabled={busy}
        />
        <button
          type="button"
          className={`epoch-chip guide-cloud${cloudOn ? ' on' : ''}`}
          aria-pressed={cloudOn}
          aria-label="Ask cloud (needs key)"
          title={cfg.hasKey ? `Cloud via ${cfg.model}` : 'Cloud needs a key in Settings'}
          onClick={() => setCloudOn((v) => !v)}
        >☁</button>
        <button type="submit" className="epoch-chip" aria-label="Send" disabled={busy}>→</button>
      </form>
    </section>
  );
}

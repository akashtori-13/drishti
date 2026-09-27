import type { CompareMode } from '@/lib/store';
import { SHOWCASE_IDS } from '@/lib/showcases';

/** Rule-based local guide ("Pip"): deterministic intents over repo data.
 *  No network, no LLM — every answer traces to app state or static copy,
 *  so it stays scientifically accurate offline. */

export type GuideToggleKey = 'colorblind' | 'autoplay' | 'showMarkers';

export type GuideAction =
  | { kind: 'navigate'; href: string }
  | { kind: 'preview'; id: string }
  | { kind: 'mode'; mode: CompareMode }
  | { kind: 'band'; band: number }
  | { kind: 'epoch'; epoch: number | 'first' | 'last' | 'next' | 'prev' }
  | { kind: 'toggle'; key: GuideToggleKey; value?: boolean }
  | { kind: 'cmap'; cmap: 'grayscale' | 'viridis' | 'inferno' | 'cividis' | null }
  | { kind: 'none' };

export interface GuideShowcaseCtx {
  id: string;
  title: string;
  epochs: number;
  bands: number[];
  story: string;
}

export interface GuideContext {
  route: string;
  showcase: GuideShowcaseCtx | null;
  compareMode: CompareMode;
  epochIdx: number;
  band: number;
  entryCmap: string | null;
  online: boolean;
  toggles: Record<GuideToggleKey, boolean>;
}

export interface GuideReply {
  text: string;
  actions: GuideAction[];
  chips?: string[];
}

const FIELD_TITLES: Record<string, string> = {
  '3i-atlas': '3I/ATLAS',
  'ecliptic-mover': 'Ecliptic mover',
  'nep-deep': 'NEP deep field',
  'orion-field': 'Orion',
  'galactic-center': 'Galactic center',
  'm31-field': 'Andromeda (M31)',
  'lmc-field': 'Large Magellanic Cloud',
  'virgo-field': 'Virgo',
  'eros-field': 'Eros field',
  'crab-field': 'Crab',
  'omega-cen-field': 'Omega Centauri',
  'carina-field': 'Carina',
  'm51-field': 'Whirlpool (M51)',
  'm101-field': 'Pinwheel (M101)',
  'smc-field': 'Small Magellanic Cloud',
  'dorado-deep': 'Dorado deep',
  'draco-field': 'Draco',
  'ophiuchus-field': 'Ophiuchus',
  'libra-field': 'Libra',
  'hercules-field': 'Hercules',
};

function normTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

const FIELD_ALIASES: Array<[RegExp, string]> = [
  [/\b3i\b|\batlas\b|visitor|interstellar/, '3i-atlas'],
  [/\bandromeda\b|\bm31\b/, 'm31-field'],
  [/\bwhirlpool\b|\bm51\b/, 'm51-field'],
  [/\bpinwheel\b|\bm101\b/, 'm101-field'],
  [/\bcrab\b/, 'crab-field'],
  [/\bvirgo\b/, 'virgo-field'],
  [/\bcarina\b|\beta car/, 'carina-field'],
  [/\bomega\b|\bngc 5139\b/, 'omega-cen-field'],
  [/\bsmc\b/, 'smc-field'],
  [/\blmc\b/, 'lmc-field'],
  [/\bdorado\b/, 'dorado-deep'],
  [/\bdraco\b/, 'draco-field'],
  [/\blibra\b/, 'libra-field'],
  [/\bhercules\b/, 'hercules-field'],
  [/\beros\b/, 'eros-field'],
  [/\bnep\b|north ecliptic/, 'nep-deep'],
  [/\bophiuchus\b/, 'ophiuchus-field'],
  [/\becliptic\b|mover/, 'ecliptic-mover'],
  [/\bgalactic center\b/, 'galactic-center'],
  [/\borion\b/, 'orion-field'],
];

function findField(q: string): string | null {
  const norm = ` ${q.toLowerCase().replace(/[^a-z0-9/ ]/g, ' ')} `;
  for (const id of SHOWCASE_IDS) {
    if (norm.includes(` ${id.replace(/-/g, ' ')} `) || norm.includes(id)) return id;
  }
  for (const [id, title] of Object.entries(FIELD_TITLES)) {
    if (norm.includes(` ${normTitle(title)} `)) return id;
  }
  for (const [re, id] of FIELD_ALIASES) {
    if (re.test(norm)) return id;
  }
  return null;
}

function bandNum(q: string): { n: number; explicit: boolean } | null {
  const m = q.match(/band\s*d?\s*(\d+)|detector\s*d?\s*(\d+)|\bd\s*(\d+)/);
  if (!m) return null;
  return { n: Number(m[1] ?? m[2] ?? m[3]), explicit: true };
}

function epochNum(q: string): number | null {
  const m = q.match(/epoch\s*(-?\d+)/);
  return m ? Number(m[1]) : null;
}

/** Special per-field summaries (Pip repeats on-screen facts, never diagnoses). */
function specialSummary(id: string): string | null {
  if (id === '3i-atlas') {
    return '3I/ATLAS: third confirmed visitor from another star. If you stare at one spot you lose it — this view follows its saved Horizons path. Measured faint and consistent-static; no brightness or colour evolution at these uncertainties, so no outburst is claimed. Numbers and error bars are on screen.';
  }
  return null;
}

/** Pop-level summary of a blink page. Never claims detections. */
export function summarizeBlink(s: GuideShowcaseCtx, mode: CompareMode): string {
  const bandList = s.bands.length > 0 ? ` Band${s.bands.length > 1 ? 's' : ''} ${s.bands.join(', ')}` : '';
  return `You're viewing ${s.title}: ${s.epochs} cached SPHEREx epoch${s.epochs === 1 ? '' : 's'}.${bandList}. ` +
    `You're in ${mode} mode — scrub the timeline and watch for anything that moves against the static stars. ` +
    `Moving dots are usually asteroids; ask me about this field any time.`;
}

export function answerGuide(raw: string, ctx: GuideContext): GuideReply {
  const q = raw.toLowerCase().trim();
  if (!q) return { text: 'Ask me to take you somewhere, explain a page, or flip a setting.', actions: [], chips: ['Take me to the sky', 'What is DRISHTI?'] };

  // Greetings.
  if (/^(hi|hey|hello|yo|sup|howdy)\b/.test(q)) {
    return {
      text: 'Hi, I\u2019m Pip. I can take you to any page or field, explain what you\u2019re looking at, and flip viewer settings on request.',
      actions: [],
      chips: ['What am I looking at?', 'Take me to 3I/ATLAS'],
    };
  }

  // Help / capabilities.
  if (q.includes('help') || q.includes('what can you') || q.includes('abilities')) {
    return {
      text: 'Three things: 1) say "take me to …" and I navigate; 2) ask "what am I looking at" for a plain-language summary; 3) say "turn on …" and I flip viewer settings like Difference mode or cividis. I only answer from app data — no guessing.',
      actions: [],
      chips: ['Take me to the sky', 'Turn on Difference mode'],
    };
  }

  // Data provenance (honesty-safe, static copy).
  if (q.includes('where') && (q.includes('data') || q.includes('image')) || q.includes('irsa') || q.includes('doi') || q.includes('spherex')) {
    if (q.includes('do you') || q.includes('use') || q.includes('come from') || q.includes('where') || q.includes('irsa') || q.includes('doi')) {
      return {
        text: 'Every frame is a cached SPHEREx cutout from the NASA/IPAC Infrared Science Archive (QR2, DOI 10.26131/IRSA652; QR3 where covered). Nothing here is live sky, and I never report a discovery — candidates are measured in-app with uncertainties.',
        actions: [],
        chips: ['Take me to the mission page'],
      };
    }
  }

  // 3I/ATLAS + control star: qualified, static copy only.
  if (q.includes('outburst') || (q.includes('3i') && (q.includes('claim') || q.includes('found') || q.includes('discover')))) {
    return {
      text: 'No outburst is claimed. 3I/ATLAS measures faint and consistent-static at these uncertainties — numbers and error bars are on screen. A past pipeline bug once flagged a control star at 28.9σ; it was withdrawn to "can\u2019t tell".',
      actions: [],
      chips: ['Take me to 3I/ATLAS'],
    };
  }

  // Offline / connection questions (Pip itself always works offline).
  if (q.includes('offline') || q.includes('no wifi') || q.includes('no internet') || q.includes('connection') || q.includes('internet') || q.includes('airplane')) {
    return {
      text: `${ctx.online ? 'You\u2019re online.' : 'You\u2019re offline — answering from app data.'} Everything I do — navigate, explain, flip settings — works from cached app data. Name resolve and live-sky tiles need connection; otherwise try coordinates or a cached field.`,
      actions: [],
      chips: ['Take me to 3I/ATLAS', 'What am I looking at?'],
    };
  }

  // Explicit on/off direction; bare nouns invert from current state.
  const saysOn = /(turn on|switch on|enable|show)\b/.test(q);
  const saysOff = /(turn off|switch off|disable|hide)\b/.test(q);

  // Settings toggles.
  const toggleReply = (key: GuideToggleKey, label: string, onText: string, offText: string): GuideReply => {
    const value = saysOn ? true : saysOff ? false : !ctx.toggles[key];
    return {
      text: value ? onText : offText,
      actions: [{ kind: 'toggle', key, value }],
    };
  };
  if (q.includes('colorblind') || q.includes('cividis') || q.includes('color blind')) {
    // "use cividis colormap" is a palette request, handled below; bare mentions toggle.
    if (!q.includes('colormap') && !q.includes('palette')) {
      return toggleReply('colorblind',
        'cividis',
        'Done — Cividis on. Thumbnails, previews, and colormaps lock to the colorblind-safe palette.',
        'Done — Cividis off. Back to the default palette.');
    }
  }
  if (q.includes('autoplay') && !q.includes('what') && !q.includes('is ')) {
    return toggleReply('autoplay',
      'autoplay',
      'Done — Autoplay on. Previews animate on open.',
      'Done — Autoplay off. Previews stay still until you play them.');
  }
  if ((q.includes('marker') || q.includes('overlay')) && !q.includes('what')) {
    return toggleReply('showMarkers',
      'markers',
      'Done — Markers on.',
      'Done — Markers off.');
  }

  // Colormaps (entry override for the next blink view). Checked before
  // compare modes so "viridis" doesn't trip the color-mode branch.
  const cmapM = q.match(/(grayscale|grey|gray|viridis|inferno|cividis)(?:\s*(?:colormap|palette|colors?))?/);
  if (cmapM && (q.includes('colormap') || q.includes('palette') || q.includes('color') || q.includes('use ') || q.includes('set ') || q.includes('switch'))) {
    const want = cmapM[1] === 'grey' || cmapM[1] === 'gray' ? 'grayscale' : cmapM[1] as 'grayscale' | 'viridis' | 'inferno' | 'cividis';
    if (q.includes('reset') || q.includes('default') || q.includes('auto')) {
      return { text: 'Done — Colormap reset to default.', actions: [{ kind: 'cmap', cmap: null }] };
    }
    if (ctx.toggles.colorblind && want !== 'cividis') {
      return { text: 'Cividis lock is on (colorblind mode), so palettes stay cividis. Turn colorblind mode off first to use another palette.', actions: [] };
    }
    const name = want[0].toUpperCase() + want.slice(1);
    return { text: `Done — ${name} colormap set for the next blink view.`, actions: [{ kind: 'cmap', cmap: want }] };
  }

  // Compare modes.
  if (q.includes('difference') || q.includes('diff mode') || (q === 'diff')) {
    if (ctx.compareMode === 'diff') {
      return { text: 'Done — Already in Difference mode; nothing changed.', actions: [] };
    }
    return {
      text: 'Done — Difference mode on. Stationary stars cancel to gray; a mover leaves a bright-dark pair.',
      actions: [{ kind: 'mode', mode: 'diff' }],
    };
  }
  const modeMap: Array<[RegExp, CompareMode, string]> = [
    [/side.by.side|side mode/, 'side', 'Done — Side-by-side on.'],
    [/swipe/, 'swipe', 'Done — Swipe curtain on. Drag to compare.'],
    [/replay/, 'replay', 'Done — Replay on.'],
    [/color/, 'color', 'Done — Color mode on.'],
    [/\bblink\b/, 'blink', 'Done — Blink mode on. Frames alternate.'],
  ];
  for (const [re, mode, text] of modeMap) {
    if (re.test(q) && (q.includes('turn on') || q.includes('switch') || q.includes('mode') || q.includes('set') || q.includes('use'))) {
      if (ctx.compareMode === mode) {
        return { text: `Done — Already in ${mode} mode; nothing changed.`, actions: [] };
      }
      return { text, actions: [{ kind: 'mode', mode }] };
    }
  }

  // Bands (1–6, validated so out-of-range explains instead of falling through).
  const b = bandNum(q);
  if (b !== null) {
    const cur = ctx.band;
    if (b.n < 1 || b.n > 6) {
      return { text: `Band ${b.n} doesn't exist — bands run 1–6 (you're on band ${cur}). Say "band 4" to switch.`, actions: [] };
    }
    if (b.n === cur) {
      return { text: `Done — Already on band ${cur}; nothing changed.`, actions: [] };
    }
    return {
      text: `Done — Band ${b.n} selected. Same-band visits only; each band is one SPHEREx detector's tint.`,
      actions: [{ kind: 'band', band: b.n }],
    };
  }

  // Epochs (panel clamps to the showcase range).
  const e = epochNum(q);
  if (e !== null) {
    const n = ctx.showcase?.epochs ?? 0;
    if (n === 0) {
      return { text: `I can't jump to epoch ${e} yet — this field is still loading its epochs. Ask again in a moment.`, actions: [] };
    }
    if (e >= n) {
      return { text: `Done — Epoch ${e} is past the end; showing the latest instead (epoch ${n - 1} of ${n}).`, actions: [{ kind: 'epoch', epoch: e }] };
    }
    if (e < 0) {
      return { text: 'Done — Before the start; showing the first epoch instead.', actions: [{ kind: 'epoch', epoch: 'first' }] };
    }
    return { text: `Done — Epoch ${e} shown (of ${n}).`, actions: [{ kind: 'epoch', epoch: e }] };
  }
  if (q.includes('first epoch')) return { text: 'Done — First epoch shown.', actions: [{ kind: 'epoch', epoch: 'first' }] };
  if (q.includes('last epoch') || q.includes('latest epoch')) {
    const n = ctx.showcase?.epochs ?? 0;
    return { text: n > 0 ? `Done — Latest epoch shown (epoch ${n - 1} of ${n}).` : 'Forward to the latest epoch.', actions: [{ kind: 'epoch', epoch: 'last' }] };
  }
  if (q.includes('next epoch')) return { text: 'Stepping to the next epoch.', actions: [{ kind: 'epoch', epoch: 'next' }] };
  if (q.includes('prev') || q.includes('previous epoch')) return { text: 'Stepping to the previous epoch.', actions: [{ kind: 'epoch', epoch: 'prev' }] };

  // Readback — what am I using right now (no mutation).
  if (/^what (mode|band|detector|epoch|settings|colormap|cmap|markers|colorblind|autoplay)/.test(q) || q.includes('what am i using') || q.includes('summarize settings')) {
    const n = ctx.showcase?.epochs ?? 0;
    const cmapName = ctx.toggles.colorblind ? 'Cividis lock is on.' : ctx.entryCmap ? `${ctx.entryCmap[0].toUpperCase()}${ctx.entryCmap.slice(1)} entry colormap.` : 'Default colormap (no override).';
    if (q.includes('mode')) return { text: `You're in ${ctx.compareMode} mode.`, actions: [] };
    if (q.includes('band') || q.includes('detector')) return { text: `Band ${ctx.band}. Each band is one SPHEREx detector's tint.`, actions: [] };
    if (q.includes('epoch')) return { text: n > 0 ? `Epoch ${Math.min(ctx.epochIdx, n - 1)} of ${n}.` : 'Epochs are still loading.', actions: [] };
    if (q.includes('colormap') || q.includes('cmap')) return { text: cmapName, actions: [] };
    return {
      text: `${ctx.compareMode} mode, band ${ctx.band}, epoch ${n > 0 ? `${Math.min(ctx.epochIdx, n - 1)} of ${n}` : '—'}, markers ${ctx.toggles.showMarkers ? 'on' : 'off'}, autoplay ${ctx.toggles.autoplay ? 'on' : 'off'}, cividis ${ctx.toggles.colorblind ? 'on' : 'off'}, colormap ${ctx.toggles.colorblind ? 'cividis lock' : ctx.entryCmap ?? 'default'}.`,
      actions: [],
    };
  }

  // Unknown mode word ("turn on xray mode").
  if ((q.includes('turn on') || q.includes('switch') || q.includes('set ') || q.includes('use ')) && q.includes('mode')) {
    return { text: `I know six modes: blink, side-by-side, swipe, difference, replay, color. You're in ${ctx.compareMode} mode.`, actions: [] };
  }

  // "What am I looking at" — route-aware.
  if (q.includes('what am i') || q.includes("what's here") || q.includes('what is this') || q.includes('looking at') || q.includes('summar')) {
    if (ctx.showcase) {
      const special = specialSummary(ctx.showcase.id);
      return { text: special ?? summarizeBlink(ctx.showcase, ctx.compareMode), actions: [], chips: ['Turn on Difference mode'] };
    }
    if (ctx.route.startsWith('/blink')) {
      return { text: 'This blink page is still loading its cached epochs — ask again in a moment.', actions: [] };
    }
    const routeBlurb: Record<string, string> = {
      '/sky': 'The all-sky map: cached SPHEREx coverage you can pan. Tap anywhere to jump into a blink.',
      '/candidates': 'Featured fields the team measured by hand — each card opens a blink with verdicts.',
      '/mission': 'How DRISHTI works: method, data sources, and citation. No discovery claims, uncertainties on screen.',
      '/crew': 'Team AKASHTORI — the six students who built this.',
      '/about': 'Settings: accessibility, playback, and about. This is also where you can switch me off.',
      '/': 'DRISHTI home: a public blink comparator for the SPHEREx sky. Pick a field and press play.',
    };
    const base = routeBlurb[ctx.route] ?? 'A DRISHTI page. Use the nav above to explore sky, fields, mission, and settings.';
    return { text: base, actions: [], chips: ['Take me to the sky'] };
  }

  // Navigation.
  const goSky = q.includes('sky') && !q.includes('skybot');
  if ((q.includes('take me') || q.includes('go to') || q.includes('open') || q.includes('show me') || q.includes('navigate')) ) {
    const field = findField(q);
    if (field) {
      const title = FIELD_TITLES[field] ?? field;
      return {
        text: `Opening ${title} — cached epochs, same viewer you already know.`,
        actions: [{ kind: 'navigate', href: `/blink/${field}` }],
      };
    }
    if (goSky || q.includes('map')) return { text: 'To the sky map.', actions: [{ kind: 'navigate', href: '/sky' }] };
    if (q.includes('candidate') || q.includes('featured') || q.includes('field')) return { text: 'To featured fields.', actions: [{ kind: 'navigate', href: '/candidates' }] };
    if (q.includes('mission') || q.includes('how') || q.includes('tour')) return { text: 'To the mission page.', actions: [{ kind: 'navigate', href: '/mission' }] };
    if (q.includes('crew') || q.includes('team')) return { text: 'To the crew page.', actions: [{ kind: 'navigate', href: '/crew' }] };
    if (q.includes('setting') || q.includes('about')) return { text: 'To settings.', actions: [{ kind: 'navigate', href: '/about' }] };
    if (q.includes('home') || q.includes('start')) return { text: 'Home.', actions: [{ kind: 'navigate', href: '/' }] };
  }
  // Bare field mentions ("3i atlas?", "orion?") navigate too.
  if (/^(take me to|show|open)?\s*[a-z0-9/ -]*\??$/.test(q)) {
    const field = findField(q);
    if (field && q.length > 2) {
      const title = FIELD_TITLES[field] ?? field;
      return { text: `Opening ${title}.`, actions: [{ kind: 'navigate', href: `/blink/${field}` }] };
    }
  }
  if (q.includes('sky') && !q.includes('skybot')) return { text: 'To the sky map.', actions: [{ kind: 'navigate', href: '/sky' }] };

  // Fallback: honest, no guessing.
  return {
    text: 'I didn\u2019t catch that — I navigate ("take me to Orion"), explain ("what am I looking at"), and flip settings ("turn on Difference mode"). Try one of those.',
    actions: [],
    chips: ctx.route.startsWith('/blink') ? ['What am I looking at?', 'Turn on Difference mode'] : ['Take me to the sky', 'What can you do?'],
  };
}

import { describe, expect, it } from 'vitest';
import { answerGuide, summarizeBlink, type GuideContext } from '@/lib/guide';

const base: GuideContext = {
  route: '/',
  showcase: null,
  compareMode: 'blink',
  epochIdx: 0,
  band: 3,
  entryCmap: null,
  online: true,
  toggles: { colorblind: false, autoplay: true, showMarkers: true },
};

const blinkCtx: GuideContext = {
  ...base,
  route: '/blink/orion-field',
  showcase: { id: 'orion-field', title: 'Orion', epochs: 7, bands: [3], story: 'Young stars.' },
};

describe('guide intents', () => {
  it('greets', () => {
    const r = answerGuide('hello', base);
    expect(r.text).toMatch(/Pip/);
    expect(r.actions).toEqual([]);
  });
  it('navigates to known fields', () => {
    const r = answerGuide('take me to Orion', base);
    expect(r.actions).toEqual([{ kind: 'navigate', href: '/blink/orion-field' }]);
  });
  it('navigates to 3I/ATLAS by nickname', () => {
    const r = answerGuide('show me the visitor', base);
    expect(r.actions).toEqual([{ kind: 'navigate', href: '/blink/3i-atlas' }]);
  });
  it('navigates to pages', () => {
    expect(answerGuide('take me to the sky', base).actions).toEqual([{ kind: 'navigate', href: '/sky' }]);
    expect(answerGuide('open settings', base).actions).toEqual([{ kind: 'navigate', href: '/about' }]);
  });
  it('sets difference mode', () => {
    const r = answerGuide('turn on Difference mode', blinkCtx);
    expect(r.actions).toEqual([{ kind: 'mode', mode: 'diff' }]);
  });
  it('sets bands 1-6 only', () => {
    expect(answerGuide('band 4', blinkCtx).actions).toEqual([{ kind: 'band', band: 4 }]);
    expect(answerGuide('use detector d2', blinkCtx).actions).toEqual([{ kind: 'band', band: 2 }]);
    expect(answerGuide('band 9', blinkCtx).actions).toEqual([]);
  });
  it('jumps epochs', () => {
    expect(answerGuide('go to epoch 3', blinkCtx).actions).toEqual([{ kind: 'epoch', epoch: 3 }]);
    expect(answerGuide('last epoch', blinkCtx).actions).toEqual([{ kind: 'epoch', epoch: 'last' }]);
  });
  it('toggles colorblind from current state', () => {
    const r = answerGuide('turn on colorblind mode', blinkCtx);
    expect(r.actions).toEqual([{ kind: 'toggle', key: 'colorblind', value: true }]);
  });
  it('summarizes the blink page without claiming detections', () => {
    const r = answerGuide('what am I looking at?', blinkCtx);
    expect(r.text).toMatch(/Orion/);
    expect(r.text).toMatch(/7 cached/);
    expect(r.text).not.toMatch(/discover/i);
  });
  it('answers provenance with DOI', () => {
    const r = answerGuide('where does the data come from?', base);
    expect(r.text).toMatch(/10\.26131\/IRSA652/);
  });
  it('refuses outburst claims', () => {
    const r = answerGuide('did 3I have an outburst?', base);
    expect(r.text).toMatch(/No outburst/);
  });
  it('falls back honestly', () => {
    const r = answerGuide('quantize the nebula flux now', base);
    expect(r.actions).toEqual([]);
    expect(r.text).toMatch(/didn’t catch/);
  });
});

describe('summarizeBlink', () => {
  it('names field, counts, mode', () => {
    const s = summarizeBlink({ id: 'x', title: 'Virgo', epochs: 8, bands: [3], story: '' }, 'diff');
    expect(s).toMatch(/Virgo/);
    expect(s).toMatch(/8 cached/);
    expect(s).toMatch(/diff/);
  });
});

describe('grammar upgrades', () => {
  it('explicit turn off sets false, not invert', () => {
    const r = answerGuide('turn off markers', { ...blinkCtx, toggles: { ...blinkCtx.toggles, showMarkers: false } });
    expect(r.actions).toEqual([{ kind: 'toggle', key: 'showMarkers', value: false }]);
  });
  it('readback reports live state without mutating', () => {
    const r = answerGuide('what mode am I in?', { ...blinkCtx, compareMode: 'diff' });
    expect(r.actions).toEqual([]);
    expect(r.text).toMatch(/diff/);
    const s = answerGuide('what settings am I using?', blinkCtx);
    expect(s.actions).toEqual([]);
    expect(s.text).toMatch(/band 3/);
  });
  it('cmap intent sets entry override', () => {
    const r = answerGuide('use viridis colormap', blinkCtx);
    expect(r.actions).toEqual([{ kind: 'cmap', cmap: 'viridis' }]);
  });
  it('cmap blocked by cividis lock explains, no action', () => {
    const r = answerGuide('use viridis colormap', { ...blinkCtx, toggles: { ...blinkCtx.toggles, colorblind: true } });
    expect(r.actions).toEqual([]);
    expect(r.text).toMatch(/Cividis lock/);
  });
  it('next/prev epoch intents', () => {
    expect(answerGuide('next epoch', blinkCtx).actions).toEqual([{ kind: 'epoch', epoch: 'next' }]);
    expect(answerGuide('previous epoch', blinkCtx).actions).toEqual([{ kind: 'epoch', epoch: 'prev' }]);
  });
  it('out-of-range epoch clamps with a note', () => {
    const r = answerGuide('go to epoch 99', blinkCtx);
    expect(r.text).toMatch(/past the end/);
    expect(r.actions).toEqual([{ kind: 'epoch', epoch: 99 }]);
  });
  it('unknown mode lists the six', () => {
    const r = answerGuide('turn on xray mode', blinkCtx);
    expect(r.actions).toEqual([]);
    expect(r.text).toMatch(/six modes/);
  });
  it('offline questions get the offline frame', () => {
    const r = answerGuide('am I offline?', { ...base, online: false });
    expect(r.actions).toEqual([]);
    expect(r.text).toMatch(/offline/);
  });
  it('3I summary is qualified', () => {
    const r = answerGuide('what am I looking at?', {
      ...blinkCtx,
      showcase: { id: '3i-atlas', title: '3I/ATLAS', epochs: 2, bands: [3], story: '' },
    });
    expect(r.text).toMatch(/no outburst is claimed/);
    expect(r.text).not.toMatch(/discover/i);
  });
  it('alias fields resolve', () => {
    expect(answerGuide('take me to the whirlpool', base).actions).toEqual([{ kind: 'navigate', href: '/blink/m51-field' }]);
    expect(answerGuide('take me to Mordor', base).actions).toEqual([]);
  });
});

describe('golden honesty set', () => {
  const cases: Array<{ q: string; ctx: GuideContext; acts: unknown; has: string[]; hasNot: string[] }> = [
    { q: 'take me to Orion', ctx: base, acts: [{ kind: 'navigate', href: '/blink/orion-field' }], has: ['Orion'], hasNot: [] },
    { q: 'turn on Difference mode', ctx: blinkCtx, acts: [{ kind: 'mode', mode: 'diff' }], has: ['Difference'], hasNot: [] },
    { q: 'where does the data come from?', ctx: base, acts: [], has: ['10.26131/IRSA652', 'Nothing here is live sky'], hasNot: ['outburst detected'] },
    { q: 'did 3I have an outburst?', ctx: base, acts: [], has: ['No outburst'], hasNot: [] },
    { q: 'band 9', ctx: blinkCtx, acts: [], has: ['1–6'], hasNot: [] },
    { q: 'quantize the nebula flux now', ctx: base, acts: [], has: ['didn\u2019t catch'], hasNot: [] },
    { q: 'what am I looking at?', ctx: blinkCtx, acts: [], has: ['Orion', 'cached'], hasNot: [] },
  ];
  it.each(cases.map((c, i) => [i, c] as const))('golden %i: %s', (_i, c) => {
    const r = answerGuide(c.q, c.ctx);
    expect(r.actions).toEqual(c.acts);
    for (const h of c.has) expect(r.text).toMatch(new RegExp(h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    for (const h of c.hasNot) expect(r.text).not.toMatch(new RegExp(h));
  });
});

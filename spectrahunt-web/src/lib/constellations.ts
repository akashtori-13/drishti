// Constellation Rush data + pure game logic (DOM-free, unit-tested).
// Node positions are simplified unit-box asterisms (x right, y down) that
// preserve each figure's recognizable shape.

export interface StarNode { x: number; y: number; name: string }
export interface Figure {
  id: string;
  name: string;
  fact: string;
  nodes: StarNode[];
}

export const FIGURES: Figure[] = [
  {
    id: 'orion', name: 'Orion',
    fact: 'Orion hosts M42, a stellar nursery 1,300 light-years away.',
    nodes: [
      { x: 0.30, y: 0.18, name: 'Betelgeuse' },
      { x: 0.68, y: 0.20, name: 'Bellatrix' },
      { x: 0.42, y: 0.48, name: 'Alnitak' },
      { x: 0.50, y: 0.50, name: 'Alnilam' },
      { x: 0.58, y: 0.52, name: 'Mintaka' },
      { x: 0.34, y: 0.80, name: 'Saiph' },
      { x: 0.66, y: 0.82, name: 'Rigel' },
    ],
  },
  {
    id: 'cassiopeia', name: 'Cassiopeia',
    fact: 'Cassiopeia’s W circles the pole star — a circumpolar clock.',
    nodes: [
      { x: 0.12, y: 0.62, name: 'Caph' },
      { x: 0.30, y: 0.40, name: 'Schedar' },
      { x: 0.50, y: 0.55, name: 'Gamma Cas' },
      { x: 0.68, y: 0.34, name: 'Ruchbah' },
      { x: 0.88, y: 0.50, name: 'Segin' },
    ],
  },
  {
    id: 'dipper', name: 'Big Dipper',
    fact: 'Dubhe and Merak point at Polaris — nature’s signpost.',
    nodes: [
      { x: 0.72, y: 0.22, name: 'Dubhe' },
      { x: 0.62, y: 0.30, name: 'Merak' },
      { x: 0.50, y: 0.38, name: 'Phecda' },
      { x: 0.40, y: 0.34, name: 'Megrez' },
      { x: 0.28, y: 0.42, name: 'Alioth' },
      { x: 0.18, y: 0.52, name: 'Mizar' },
      { x: 0.08, y: 0.62, name: 'Alkaid' },
    ],
  },
  {
    id: 'cygnus', name: 'Cygnus',
    fact: 'Deneb is one of the most distant stars you can see naked-eye.',
    nodes: [
      { x: 0.50, y: 0.12, name: 'Deneb' },
      { x: 0.50, y: 0.45, name: 'Sadr' },
      { x: 0.28, y: 0.52, name: 'Gienah' },
      { x: 0.64, y: 0.60, name: 'Delta Cyg' },
      { x: 0.50, y: 0.86, name: 'Albireo' },
    ],
  },
  {
    id: 'scorpius', name: 'Scorpius',
    fact: 'Antares is a red supergiant — submit a variable hunt here.',
    nodes: [
      { x: 0.50, y: 0.45, name: 'Antares' },
      { x: 0.30, y: 0.28, name: 'Graffias' },
      { x: 0.68, y: 0.30, name: 'Dschubba' },
      { x: 0.74, y: 0.62, name: 'Larawag' },
      { x: 0.58, y: 0.84, name: 'Lesath' },
    ],
  },
];

export interface PlayState {
  figureIdx: number;
  hitIdx: number; // next node to hit
  score: number;
  streak: number;
  done: number; // constellations completed
}

export const initialPlay = (): PlayState => ({ figureIdx: 0, hitIdx: 0, score: 0, streak: 0, done: 0 });

export type TapResult =
  | { kind: 'hit'; complete: boolean; gained: number }
  | { kind: 'miss'; lost: number }
  | { kind: 'repeat' };

/** Tap/click/Enter on node i of the current figure. Pure reducer. */
export function tapNode(s: PlayState, i: number): { state: PlayState; result: TapResult } {
  const fig = FIGURES[s.figureIdx % FIGURES.length];
  if (i === s.hitIdx) {
    const gained = 100 + s.streak * 25;
    const complete = s.hitIdx + 1 >= fig.nodes.length;
    return {
      state: {
        figureIdx: complete ? s.figureIdx + 1 : s.figureIdx,
        hitIdx: complete ? 0 : s.hitIdx + 1,
        score: s.score + gained,
        streak: s.streak + 1,
        done: complete ? s.done + 1 : s.done,
      },
      result: { kind: 'hit', complete, gained },
    };
  }
  if (i < 0 || i >= fig.nodes.length) {
    return { state: { ...s, streak: 0 }, result: { kind: 'miss', lost: Math.min(25, s.score) } };
  }
  if (i < s.hitIdx) return { state: s, result: { kind: 'repeat' } };
  // tapped a future node out of order: counts as a miss, keeps progress
  return {
    state: { ...s, streak: 0, score: Math.max(0, s.score - 25) },
    result: { kind: 'miss', lost: 25 },
  };
}

/** Node index under a unit-box point within radius r (in the same units). */
export function nodeAt(fig: Figure, x: number, y: number, r = 0.07): number {
  let best = -1;
  let bestD = r;
  fig.nodes.forEach((n, i) => {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d <= bestD) { bestD = d; best = i; }
  });
  return best;
}

/** Score line for the HUD. */
export function scoreLine(s: PlayState): string {
  return `${s.score} pts · ${s.done} drawn`;
}

// STELLAR Invaders: pixel sprites, bitmap font, wave/scoring/collision logic.
// DOM-free and unit-tested; the canvas shell lives in WaitGame.tsx.

export type Row = string[];

/** Player cannon, 11x7. */
export const PLAYER: Row = [
  '.....X.....',
  '.....X.....',
  '....XXX....',
  '....XXX....',
  '..XXXXXXX..',
  '.XXXXXXXXX.',
  'XXXXXXXXXXX',
];

/** Invader crab, 11x8, two frames (legs alternate). */
export const CRAB_A: Row = [
  '..X.....X..',
  '...X...X...',
  '..XXXXXXX..',
  '.XX.XXX.XX.',
  'XXXXXXXXXXX',
  'X.XXXXXXX.X',
  'X.X.....X.X',
  '...XX.XX...',
];
export const CRAB_B: Row = [
  '..X.....X..',
  'X..X...X..X',
  'X.XXXXXXX.X',
  '.XX.XXX.XX.',
  'XXXXXXXXXXX',
  '..XXXXXXX..',
  '..X.....X..',
  '.XX.....XX.',
];

/** Invader squid, 8x8, two frames. */
export const SQUID_A: Row = [
  '...XX...',
  '..XXXX..',
  '.XXXXXX.',
  'XX.XX.XX',
  'XXXXXXXX',
  '..X..X..',
  '.XX..XX.',
  'XX....XX',
];
export const SQUID_B: Row = [
  '...XX...',
  '..XXXX..',
  '.XXXXXX.',
  'XX.XX.XX',
  'XXXXXXXX',
  '.XX..XX.',
  'XX.XX.XX',
  '.X....X.',
];

/** Row palette (top rows worth more). */
export const ROW_DEFS = [
  { sprite: [SQUID_A, SQUID_B] as Row[], color: '#5eead4', score: 30 },
  { sprite: [CRAB_A, CRAB_B] as Row[], color: '#f0abfc', score: 20 },
  { sprite: [CRAB_A, CRAB_B] as Row[], color: '#e8ecff', score: 20 },
  { sprite: [CRAB_A, CRAB_B] as Row[], color: '#e8ecff', score: 10 },
  { sprite: [CRAB_A, CRAB_B] as Row[], color: '#e8ecff', score: 10 },
];

export interface Alien {
  col: number; row: number;
  x: number; y: number; // top-left, playfield px
  w: number; h: number;
  sprite: Row[]; color: string; score: number;
  alive: boolean;
}

/** Sprite pixel size (shared by engine + renderer). */
export const SPRITE_PX = 4;
/** Horizontal slot per column: fits the widest sprite (11px) + breathing room. */
export const SLOT = 11 * SPRITE_PX + 12;

/** Wave layout: rows grow to 5, columns fit the playfield. Returns aliens. */
export function layoutWave(wave: number, fieldW: number, maxCols = 9): Alien[] {
  const rows = Math.min(2 + Math.floor((wave - 1) / 1), 5);
  const cols = Math.min(maxCols, Math.max(4, Math.floor(fieldW / SLOT)));
  const out: Alien[] = [];
  for (let r = 0; r < rows; r++) {
    const def = ROW_DEFS[r % ROW_DEFS.length];
    for (let c = 0; c < cols; c++) {
      out.push({
        col: c, row: r,
        x: 0, y: 0,
        w: def.sprite[0][0].length * SPRITE_PX, h: def.sprite[0].length * SPRITE_PX,
        sprite: def.sprite, color: def.color, score: def.score,
        alive: true,
      });
    }
  }
  return out;
}

/** AABB overlap. */
export function overlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Invader march speed px/s: base × wave ramp × endgame speedup. */
export function marchSpeed(wave: number, alive: number, total: number): number {
  const ramp = 1 + (wave - 1) * 0.12;
  const endgame = total > 0 ? 1 + (1 - alive / total) * 1.6 : 1;
  return 26 * ramp * endgame;
}

/** Points for a kill with a consecutive-hit streak. */
export function killScore(base: number, streak: number): number {
  return base + Math.min(streak, 8) * 5;
}

// ---------- 3x5 bitmap pixel font (A-Z 0-9 : . ! ? - + ♥) ----------

const GLYPHS: Record<string, string[]> = {
  A: ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'], B: ['XX.', 'X.X', 'XX.', 'X.X', 'XX.'],
  C: ['.XX', 'X..', 'X..', 'X..', '.XX'], D: ['XX.', 'X.X', 'X.X', 'X.X', 'XX.'],
  E: ['XXX', 'X..', 'XX.', 'X..', 'XXX'], F: ['XXX', 'X..', 'XX.', 'X..', 'X..'],
  G: ['.XX', 'X..', 'X.X', 'X.X', '.XX'], H: ['X.X', 'X.X', 'XXX', 'X.X', 'X.X'],
  I: ['XXX', '.X.', '.X.', '.X.', 'XXX'], J: ['..X', '..X', '..X', 'X.X', 'XXX'],
  K: ['X.X', 'X.X', 'XX.', 'X.X', 'X.X'], L: ['X..', 'X..', 'X..', 'X..', 'XXX'],
  M: ['X.X', 'XXX', 'XXX', 'X.X', 'X.X'], N: ['X.X', 'XXX', 'XXX', 'XXX', 'X.X'],
  O: ['.X.', 'X.X', 'X.X', 'X.X', '.X.'], P: ['XXX', 'X.X', 'XXX', 'X..', 'X..'],
  Q: ['.X.', 'X.X', 'X.X', 'XXX', '..X'], R: ['XX.', 'X.X', 'XX.', 'X.X', 'X.X'],
  S: ['.XX', 'X..', '.X.', '..X', 'XX.'], T: ['XXX', '.X.', '.X.', '.X.', '.X.'],
  U: ['X.X', 'X.X', 'X.X', 'X.X', 'XXX'], V: ['X.X', 'X.X', 'X.X', 'X.X', '.X.'],
  W: ['X.X', 'X.X', 'XXX', 'XXX', 'X.X'], X: ['X.X', 'X.X', '.X.', 'X.X', 'X.X'],
  Y: ['X.X', 'X.X', '.X.', '.X.', '.X.'], Z: ['XXX', '..X', '.X.', 'X..', 'XXX'],
  '0': ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'], '1': ['.X.', 'XX.', '.X.', '.X.', 'XXX'],
  '2': ['XXX', '..X', 'XXX', 'X..', 'XXX'], '3': ['XXX', '..X', 'XXX', '..X', 'XXX'],
  '4': ['X.X', 'X.X', 'XXX', '..X', '..X'], '5': ['XXX', 'X..', 'XXX', '..X', 'XXX'],
  '6': ['XXX', 'X..', 'XXX', 'X.X', 'XXX'], '7': ['XXX', '..X', '.X.', '.X.', '.X.'],
  '8': ['XXX', 'X.X', 'XXX', 'X.X', 'XXX'], '9': ['XXX', 'X.X', 'XXX', '..X', 'XXX'],
  ':': ['...', '.X.', '...', '.X.', '...'], '.': ['...', '...', '...', '...', '.X.'],
  '!': ['.X.', '.X.', '.X.', '...', '.X.'], '?': ['XXX', '..X', '.X.', '...', '.X.'],
  '-': ['...', '...', 'XXX', '...', '...'], '+': ['...', '.X.', 'XXX', '.X.', '...'],
  ' ': ['...', '...', '...', '...', '...'],
};

/** Pixel width of rendered text at unit scale (4px per glyph advance). */
export function textWidth(text: string): number {
  return Math.max(0, text.toUpperCase().split('').length * 4 - 1);
}
export function glyphOf(ch: string): string[] {
  return GLYPHS[ch] ?? GLYPHS['?'];
}

// ---------- canvas renderer (DOM-free: context passed in, unit-tested) ----------

/** Blit a sprite: only ink cells (not space/dot) paint. */
export function drawSprite(
  ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, color: string,
) {
  ctx.fillStyle = color;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? '';
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch !== ' ' && ch !== '.') ctx.fillRect(Math.round(x + c * SPRITE_PX), Math.round(y + r * SPRITE_PX), SPRITE_PX, SPRITE_PX);
    }
  }
}

/** Chunky bitmap text. Empty font cells are '.' — skipped exactly like spaces.
 *  Returns width drawn. */
export function drawPixelText(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number, color: string,
): number {
  const s = text.toUpperCase();
  ctx.fillStyle = color;
  let cx = Math.round(x);
  for (const ch of s) {
    const g = glyphOf(ch);
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 3; c++) {
        if (g[r][c] !== ' ' && g[r][c] !== '.') ctx.fillRect(cx + c * scale, Math.round(y) + r * scale, scale, scale);
      }
    }
    cx += 4 * scale;
  }
  return textWidth(s) * scale;
}

/** Centered bitmap text for arcade screens (countdown, game over). */
export function drawPixelTextC(
  ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, scale: number, color: string,
) {
  drawPixelText(ctx, text, cx - (textWidth(text) * scale) / 2, y, scale, color);
}

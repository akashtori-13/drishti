import type { CompareMode } from '@/lib/store';

export interface CloudCfg {
  baseUrl: string;
  model: string;
  hasKey: boolean;
}

const KEY = 'sh-cloud-key';
const URL_KEY = 'sh-cloud-url';
const MODEL_KEY = 'sh-cloud-model';
const OPTIN_KEY = 'sh-cloud-optin';

export const DEFAULT_CLOUD_URL = 'https://api.openai.com/v1';
export const DEFAULT_CLOUD_MODEL = 'gpt-4o-mini';

export function getCloudCfg(): CloudCfg {
  try {
    return {
      baseUrl: localStorage.getItem(URL_KEY) || DEFAULT_CLOUD_URL,
      model: localStorage.getItem(MODEL_KEY) || DEFAULT_CLOUD_MODEL,
      hasKey: !!localStorage.getItem(KEY),
    };
  } catch {
    return { baseUrl: DEFAULT_CLOUD_URL, model: DEFAULT_CLOUD_MODEL, hasKey: false };
  }
}

export function setCloudCfg(url: string, model: string): void {
  try {
    localStorage.setItem(URL_KEY, url);
    localStorage.setItem(MODEL_KEY, model);
  } catch { /* noop */ }
}

export function setCloudKey(key: string): void {
  try {
    if (key) localStorage.setItem(KEY, key);
    else localStorage.removeItem(KEY);
  } catch { /* noop */ }
}

export function clearCloudAll(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(URL_KEY);
    localStorage.removeItem(MODEL_KEY);
    localStorage.removeItem(OPTIN_KEY);
  } catch { /* noop */ }
}

export function getCloudOptIn(): boolean {
  try { return localStorage.getItem(OPTIN_KEY) === '1'; } catch { return false; }
}

export function setCloudOptIn(v: boolean): void {
  try { localStorage.setItem(OPTIN_KEY, v ? '1' : '0'); } catch { /* noop */ }
}

export function keyLast4(): string {
  try {
    const k = localStorage.getItem(KEY) || '';
    return k.length > 4 ? `\u2022\u2022\u2022\u2022${k.slice(-4)}` : k ? '\u2022\u2022\u2022\u2022' : '';
  } catch { return ''; }
}

/** Grounding system prompt: the model answers only from provided context. */
export const CLOUD_SYSTEM = [
  'You are Pip, the DRISHTI guide. Honesty contract: every pixel/number traces to IRSA or is labeled interpretation.',
  'Answer ONLY from the <context> block: current route, field id/title/epochs/bands, viewer state. Read numbers only from context.',
  'REFUSALS: unknown numbers → "Not measured in this bundle." No discovery claims — valid verdicts only: consistent-static, unrated, masked-excluded, unchecked. Never "outburst", "confirmed", "discovered", "AI finds".',
  '3I/ATLAS: Horizons-tracked, faint, consistent-static, no brightness/colour evolution at these uncertainties. Control-star 28.9σ is WITHDRAWN (median-fill bug, "can\'t tell").',
  'Cite SPHEREx/IRSA (DOI 10.26131/IRSA652, QR3 10.26131/IRSA662 where covered) on data claims. Short, factual, error bars always.',
].join('\n');

export interface CloudContext {
  route: string;
  fieldId: string | null;
  fieldTitle: string | null;
  epochs: number;
  bands: number[];
  compareMode: CompareMode;
}

/** One cloud ask. Throws on any failure — caller falls back to local rules. */
export async function askCloud(question: string, ctx: CloudContext, signal?: AbortSignal): Promise<string> {
  const cfg = getCloudCfg();
  if (!cfg.hasKey) throw new Error('no key');
  const key = (() => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } })();
  const context = [
    '<context>',
    `route: ${ctx.route}`,
    `field: ${ctx.fieldId ?? 'none'} (${ctx.fieldTitle ?? '—'})`,
    `epochs: ${ctx.epochs}, bands: ${ctx.bands.join(', ') || '—'}`,
    `viewer: mode=${ctx.compareMode}`,
    '</context>',
  ].join('\n');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const r = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 220,
        messages: [
          { role: 'system', content: CLOUD_SYSTEM },
          { role: 'user', content: `${context}\n\nQuestion: ${question}` },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = j.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('empty');
    return text;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

// On-device sky cache: IndexedDB for imagery (HEALPix/HiPS tiles, all-sky),
// localStorage for small JSON (constellation lines, per-view Gaia stars).
// Everything is read-through with silent fallback to network.

const DB_NAME = 'spectrahunt-sky';
const DB_STORE = 'tiles';
const MEM_LRU = new Map<string, string>(); // url -> objectURL
const MEM_LRU_MAX = 12;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
const db = () => (dbPromise ??= openDB());

async function idbGet(url: string): Promise<Blob | null> {
  try {
    const d = await db();
    return await new Promise((resolve) => {
      try {
        const tx = d.transaction(DB_STORE, 'readonly');
        const rq = tx.objectStore(DB_STORE).get(url);
        rq.onsuccess = () => resolve((rq.result as Blob) ?? null);
        rq.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

async function idbPut(url: string, blob: Blob): Promise<void> {
  try {
    if (blob.size > 4_000_000) return; // quota safety
    const d = await db();
    await new Promise<void>((resolve) => {
      try {
        const tx = d.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(blob, url);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch { /* private mode etc: memory cache still works */ }
}

function remember(url: string, objURL: string) {
  MEM_LRU.delete(url);
  MEM_LRU.set(url, objURL);
  if (MEM_LRU.size > MEM_LRU_MAX) {
    const [oldest, ourl] = MEM_LRU.entries().next().value as [string, string];
    MEM_LRU.delete(oldest);
    try { URL.revokeObjectURL(ourl); } catch { /* noop */ }
  }
}

/** Fetch an image through the device cache. Returns a usable src (objectURL when cached). */
export async function cachedImageSrc(url: string): Promise<string> {
  const mem = MEM_LRU.get(url);
  if (mem) return mem;
  const blob = await idbGet(url);
  if (blob) {
    const ourl = URL.createObjectURL(blob);
    remember(url, ourl);
    return ourl;
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const fresh = await r.blob();
  void idbPut(url, fresh);
  const ourl = URL.createObjectURL(fresh);
  remember(url, ourl);
  return ourl;
}

/** Load into an <img>-compatible element, cached. Resolves with the element. */
export function loadCachedImage(url: string): Promise<HTMLImageElement> {
  return cachedImageSrc(url).then(
    (src) =>
      new Promise((resolve, reject) => {
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('img decode failed'));
        im.src = src;
      }),
  );
}

/** Idle prefetch of neighboring views (populates cache, never touches state). */
export function prefetch(urls: string[]) {
  const run = () => {
    for (const u of urls.slice(0, 6)) {
      if (MEM_LRU.has(u)) continue;
      void idbGet(u).then((b) => {
        if (b) return;
        void fetch(u)
          .then((r) => (r.ok ? r.blob() : null))
          .then((blob) => { if (blob) void idbPut(u, blob); })
          .catch(() => undefined);
      });
    }
  };
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (ric) ric(run);
  else setTimeout(run, 1500);
}

// ---------- small JSON (localStorage, LRU-capped) ----------
const LS_INDEX = 'sh-ls-index';

function lsIndex(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LS_INDEX) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function lsGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function lsSet(key: string, value: unknown, cap = 40) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    const idx = [key, ...lsIndex().filter((k) => k !== key)].slice(0, cap);
    for (const old of lsIndex().filter((k) => !idx.includes(k))) {
      try { localStorage.removeItem(old); } catch { /* noop */ }
    }
    localStorage.setItem(LS_INDEX, JSON.stringify(idx));
  } catch { /* quota: skip */ }
}

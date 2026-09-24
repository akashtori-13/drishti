// Wave 2 (G cards-3D): pointer tilt for candidate cards.
// Guards: max 4deg, transform-only (compositor), no glare wash,
// fine-pointer + motion-safe only, reset on leave, full cleanup on unmount.

import { useEffect, type RefObject } from 'react';

export const TILT_MAX_DEG = 4;
const PERSPECTIVE_PX = 900;
const NEUTRAL =
  `perspective(${PERSPECTIVE_PX}px) rotateX(0deg) rotateY(0deg)`;

/** Motion-safe + fine-pointer gate, evaluated live so OS toggles apply. */
function tiltAllowed(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    return window.matchMedia('(pointer: fine)').matches;
  } catch {
    return false;
  }
}

function clampDeg(n: number): number {
  if (!Number.isFinite(n)) return TILT_MAX_DEG;
  return Math.min(Math.max(n, 0), TILT_MAX_DEG);
}

function transformFor(px: number, py: number, maxDeg: number): string {
  const ry = (px - 0.5) * 2 * maxDeg;
  const rx = (0.5 - py) * 2 * maxDeg;
  return `perspective(${PERSPECTIVE_PX}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
}

function bindTilt(el: HTMLElement, maxDeg: number): () => void {
  const cap = clampDeg(maxDeg);
  let raf = 0;
  let cx = 0;
  let cy = 0;
  let armed = false;
  let touched = false;

  const render = () => {
    raf = 0;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const px = Math.min(Math.max((cx - r.left) / r.width, 0), 1);
    const py = Math.min(Math.max((cy - r.top) / r.height, 0), 1);
    el.style.transform = transformFor(px, py, cap);
  };

  const queue = () => {
    if (raf) return;
    raf = requestAnimationFrame(render);
  };

  const arm = () => {
    if (!armed) {
      armed = true;
      touched = true;
      // Drag stays 1:1 — ease transform only on leave; keep the border fade.
      el.style.transition = 'border-color .15s ease';
      el.style.willChange = 'transform';
    }
  };

  const reset = () => {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    armed = false;
    if (!touched) return;
    // Ease back from the live presentation value; transform-only.
    el.style.transition =
      'transform var(--dur-ui, 220ms) var(--ease-out, cubic-bezier(.23, 1, .32, 1)), border-color .15s ease';
    el.style.transform = NEUTRAL;
    el.style.willChange = '';
  };

  const onEnter = (e: PointerEvent) => {
    if (e.pointerType === 'touch' || cap === 0 || !tiltAllowed()) return;
    arm();
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch' || cap === 0 || !tiltAllowed()) return;
    arm();
    cx = e.clientX;
    cy = e.clientY;
    queue();
  };

  const onLeave = () => reset();

  el.addEventListener('pointerenter', onEnter);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerleave', onLeave);
  el.addEventListener('pointercancel', onLeave);

  // Kill live tilt the moment reduced-motion is enabled mid-hover.
  let mq: MediaQueryList | null = null;
  const onReducedChange = () => reset();
  try {
    mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    mq.addEventListener('change', onReducedChange);
  } catch {
    mq = null;
  }

  return () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    el.removeEventListener('pointerenter', onEnter);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerleave', onLeave);
    el.removeEventListener('pointercancel', onLeave);
    try {
      mq?.removeEventListener('change', onReducedChange);
    } catch {
      /* noop */
    }
    if (touched) {
      el.style.transition = '';
      el.style.transform = '';
      el.style.willChange = '';
    }
  };
}

/** Tilt a single element. No-op unless fine-pointer + motion-safe. */
export function useTilt<T extends HTMLElement>(
  ref: RefObject<T | null>,
  maxDeg = TILT_MAX_DEG,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return bindTilt(el, maxDeg);
  }, [ref, maxDeg]);
}

/**
 * Auto-bind every `selector` match under `rootRef` (default `[data-tilt]`).
 * A MutationObserver picks up async/filtered cards; all listeners + RAFs
 * are released on unmount.
 */
export function useTiltGroup<T extends HTMLElement>(
  rootRef: RefObject<T | null>,
  selector = '[data-tilt]',
  maxDeg = TILT_MAX_DEG,
): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const bound = new Map<Element, () => void>();
    const bind = (el: Element) => {
      if (bound.has(el) || !(el instanceof HTMLElement)) return;
      bound.set(el, bindTilt(el, maxDeg));
    };
    const sweep = () => {
      try {
        if (root instanceof HTMLElement && root.matches(selector)) bind(root);
        root.querySelectorAll(selector).forEach(bind);
      } catch {
        /* invalid selector — fail silent, unbind on cleanup */
      }
    };
    sweep();
    if (typeof MutationObserver === 'undefined') {
      return () => {
        bound.forEach((unbind) => unbind());
        bound.clear();
      };
    }
    const mo = new MutationObserver(sweep);
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      bound.forEach((unbind) => unbind());
      bound.clear();
    };
  }, [rootRef, selector, maxDeg]);
}

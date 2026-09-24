'use client';

import { useEffect, useRef, useState } from 'react';

const MIN_WIDTH = 1100;
const CRAFT_W = 148;
/** Half of the 700px centered column + 20px prose padding. */
const COL_HALF = 370;
const EDGE = 12;

/** Center of the side gutter, clamped so the craft never overlaps the column or viewport edge. */
function laneX(vw: number): number {
  const gutter = (vw - COL_HALF * 2) / 2;
  const center = COL_HALF + gutter / 2;
  const min = COL_HALF + EDGE + CRAFT_W / 2;
  const max = vw / 2 - EDGE - CRAFT_W / 2;
  return Math.min(Math.max(center, min), max);
}

const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * AboutCraft: fixed side-stage SPHEREx cutout, ≥1100px only.
 * Scroll progress drives gutter-to-gutter travel (transform3d + opacity only).
 * Idle float is a CSS keyframe on the inner wrapper; banking eases toward
 * scroll-direction sign. Reduced-motion parks it static at the right gutter.
 */
export default function AboutCraft() {
  const [enabled, setEnabled] = useState(false);
  const outerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${MIN_WIDTH}px)`);
    const update = () => setEnabled(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const outer = outerRef.current;
    const img = imgRef.current;
    if (!outer || !img) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let raf = 0;
    let lastY = window.scrollY;
    let bank = 0;
    let target = 0;
    let idleTimer = 0;

    const paint = () => {
      raf = 0;
      const vw = window.innerWidth;
      const lane = laneX(vw);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0;
      let x: number;
      let opacity = 1;
      if (reduced) {
        x = lane;
      } else if (p <= 0.5) {
        x = lane - lane * 2 * easeInOut(p / 0.5);
      } else if (p <= 0.8) {
        x = -lane;
      } else {
        const k = (p - 0.8) / 0.2;
        x = -lane + lane * 2 * k;
        opacity = 1 - k;
      }
      bank += (target - bank) * 0.15;
      outer.style.transform = `translate3d(calc(-50% + ${x.toFixed(1)}px), -50%, 0)`;
      outer.style.opacity = opacity.toFixed(3);
      img.style.transform = reduced
        ? 'none'
        : `perspective(700px) rotateY(${(bank * 6).toFixed(2)}deg)`;
      if (!reduced && Math.abs(target - bank) > 0.001) kick();
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onScroll = () => {
      const y = window.scrollY;
      const d = y - lastY;
      lastY = y;
      if (!reduced) {
        if (d !== 0) target = d > 0 ? 1 : -1;
        window.clearTimeout(idleTimer);
        idleTimer = window.setTimeout(() => {
          target = 0;
          kick();
        }, 180);
      }
      kick();
    };
    const onResize = () => kick();

    paint();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(idleTimer);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      ref={outerRef}
      className="about-craft"
      aria-hidden="true"
      style={{
        position: 'fixed',
        left: '50%',
        top: '44%',
        zIndex: 0,
        pointerEvents: 'none',
        willChange: 'transform, opacity',
      }}
    >
      <div className="about-craft-float">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src="/about/spherex-hero.webp"
          alt=""
          width={CRAFT_W}
          draggable={false}
          style={{
            display: 'block',
            width: CRAFT_W,
            height: 'auto',
            WebkitMaskImage:
              'radial-gradient(ellipse 52% 52% at 50% 50%, #000 60%, transparent 98%)',
            maskImage:
              'radial-gradient(ellipse 52% 52% at 50% 50%, #000 60%, transparent 98%)',
          }}
        />
      </div>
    </div>
  );
}

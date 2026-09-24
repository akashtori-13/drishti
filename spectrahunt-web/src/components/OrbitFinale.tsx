'use client';

import { type ReactNode, useRef, useEffect, useState } from 'react';

/**
 * OrbitFinale: full-bleed cinematic end scene for About (in-flow, after the
 * copy, before the footer). Layers: earth-limb band along the bottom,
 * then the CTA content column + mono caption above a text-width scrim.
 */
export function OrbitFinale({ children }: { children: ReactNode }) {
  const v1Ref = useRef<HTMLVideoElement>(null);
  const v2Ref = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState<1 | 2>(1);

  useEffect(() => {
    const v1 = v1Ref.current;
    const v2 = v2Ref.current;
    if (!v1 || !v2) return;

    const CROSSFADE_SEC = 2.0;
    let transitionTriggeredFor = 0;

    const onTimeUpdate = (e: Event) => {
      const target = e.target as HTMLVideoElement;
      const isV1 = target === v1;
      const other = isV1 ? v2 : v1;
      
      const timeLeft = target.duration - target.currentTime;
      const currentCycle = isV1 ? 1 : 2;
      
      if (timeLeft <= CROSSFADE_SEC && transitionTriggeredFor !== currentCycle) {
        transitionTriggeredFor = currentCycle;
        other.currentTime = 0;
        other.play().catch(()=>{});
        setActive(isV1 ? 2 : 1);
      }
    };

    const onEnded = (e: Event) => {
      (e.target as HTMLVideoElement).pause();
    };

    v1.addEventListener('timeupdate', onTimeUpdate);
    v2.addEventListener('timeupdate', onTimeUpdate);
    v1.addEventListener('ended', onEnded);
    v2.addEventListener('ended', onEnded);

    v1.play().catch(()=>{});

    return () => {
      v1.removeEventListener('timeupdate', onTimeUpdate);
      v2.removeEventListener('timeupdate', onTimeUpdate);
      v1.removeEventListener('ended', onEnded);
      v2.removeEventListener('ended', onEnded);
    };
  }, []);

  return (
    <section className="orbit-finale" aria-label="Cinematic finale">
      <div className="finale-earth-container">
        <video
          ref={v1Ref}
          className="finale-earth-layer"
          src="/about/earth-cinematic.mp4"
          muted
          playsInline
          disablePictureInPicture
          aria-hidden="true"
          style={{ opacity: active === 1 ? 1 : 0, transition: 'opacity 2s ease-in-out' }}
        />
        <video
          ref={v2Ref}
          className="finale-earth-layer"
          src="/about/earth-cinematic.mp4"
          muted
          playsInline
          disablePictureInPicture
          aria-hidden="true"
          style={{ opacity: active === 2 ? 1 : 0, transition: 'opacity 2s ease-in-out' }}
        />
      </div>
      <div className="finale-content">{children}</div>
      <p className="mono finale-caption">Earth limb · schematic — not to scale</p>
    </section>
  );
}

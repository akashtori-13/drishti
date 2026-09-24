'use client';

import {
  createElement,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';

function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

/** Per-index stagger delay via --rd, capped so long lists stop growing. */
export function revealDelay(index: number): CSSProperties {
  const capped = Math.min(Math.max(0, index), 6);
  return { '--rd': `${capped * 45}ms` } as CSSProperties;
}

export function useReveal<T extends HTMLElement = HTMLDivElement>(
  index = 0,
): {
  ref: RefObject<T | null>;
  visible: boolean;
  style: CSSProperties;
} {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState<boolean>(() => prefersReducedMotion());
  useEffect(() => {
    if (prefersReducedMotion()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, visible, style: revealDelay(index) };
}

export function Reveal({
  as = 'div',
  children,
  className = '',
  index = 0,
}: {
  as?: 'div' | 'section';
  children: ReactNode;
  className?: string;
  index?: number;
}) {
  const { ref, visible, style } = useReveal<HTMLElement>(index);
  return createElement(
    as,
    {
      ref,
      style,
      className: `reveal${visible ? ' is-in' : ''}${className ? ` ${className}` : ''}`,
    },
    children,
  );
}

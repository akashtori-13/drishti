'use client';

import { useEffect, useRef, useState } from 'react';

export default function FlickerNumber({ value }: { value: number | string }) {
  const [display, setDisplay] = useState<string>('-');
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value === '-' || value === undefined || value === '') {
      setDisplay(String(value || '-'));
      return;
    }

    const targetStr = typeof value === 'number' ? value.toLocaleString() : String(value);
    
    // Fallback display immediately to avoid layout shift
    setDisplay(targetStr.replace(/[0-9]/g, '0'));

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        observer.disconnect();
        
        let iteration = 0;
        const interval = setInterval(() => {
          setDisplay(targetStr.split('').map((char, index) => {
            if (char === ',' || char === '.') return char;
            if (index < iteration) {
              return char; // locked in
            }
            return Math.floor(Math.random() * 10).toString(); // flickering
          }).join(''));
          
          iteration += 1 / 4; // 4 frames per character decode (slows the wipe down just enough)
          
          if (iteration >= targetStr.length) {
            clearInterval(interval);
            setDisplay(targetStr);
          }
        }, 30);
      }
    }, { threshold: 0.1 });
    
    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);

  return <span ref={ref}>{display}</span>;
}

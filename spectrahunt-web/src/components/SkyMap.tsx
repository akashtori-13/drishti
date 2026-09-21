'use client';

import { useEffect, useRef } from 'react';
import type { Coverage } from '@/lib/api';

interface SkyMapProps {
  coverage: Coverage;
}

export default function SkyMap({ coverage }: SkyMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !coverage) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { grid, counts } = coverage;
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // Draw grid cells
    const cellWidth = width / grid.w;
    const cellHeight = height / grid.h;

    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        const count = counts[y]?.[x] || 0;
        
        if (count > 0) {
          // Color based on epoch count
          const hue = 240 + (Math.min(count, 5) * 30);
          const lightness = 50 - (Math.min(count, 5) * 8);
          ctx.fillStyle = `hsl(${hue}, 70%, ${lightness}%)`;
          
          // Draw cell with small gap for grid effect
          ctx.fillRect(
            x * cellWidth + 0.5,
            y * cellHeight + 0.5,
            cellWidth - 1,
            cellHeight - 1
          );
        }
      }
    }

    // Draw ecliptic line (approximate)
    ctx.strokeStyle = 'rgba(255, 200, 100, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    
    for (let x = 0; x < width; x++) {
      const ra = (x / width) * 360;
      const eclipticLat = 23.4 * Math.sin((ra * Math.PI) / 180);
      const y = (height / 2) - (eclipticLat / 90) * (height / 2);
      
      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    
    ctx.stroke();
    ctx.setLineDash([]);

  }, [coverage]);

  return (
    <div className="w-full aspect-[2/1] relative">
      <canvas
        ref={canvasRef}
        width={1440}
        height={720}
        className="w-full h-full rounded-lg"
      />
      <div className="absolute bottom-4 left-4 text-xs text-slate-400">
        RA: 0° → 360° (left to right)
      </div>
      <div className="absolute top-4 left-4 text-xs text-slate-400">
        Dec: +90° (top) to -90° (bottom)
      </div>
    </div>
  );
}

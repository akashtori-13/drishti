'use client';

import { useEffect, useRef } from 'react';
import Icon from '@/components/Icon';
import { fmtDec, fmtRa } from '@/lib/sky';

export interface InspectorField {
  ra: number; dec: number; epochs: number; bands: number; survey: string;
  hasCandidate: boolean; planning: string; detector: number | string;
  measured: boolean;
}

/** Field inspector rail (desktop) / bottom sheet (mobile). */
export default function Inspector({
  field, blinkId, onClose, onOpenBlink,
}: {
  field: InspectorField | null; blinkId?: string | null;
  onClose: () => void; onOpenBlink: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const cbRef = useRef(onClose);
  useEffect(() => {
    cbRef.current = onClose;
  });
  // Focus contract: on open, focus the heading (announces the field instead of
  // a silent context change); on close, return focus to the opener. Both use
  // preventScroll — the panel never yanks the page (no silent scroll-drop;
  // no scrollIntoView/scrollTo calls exist on this surface).
  const returnTo = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (field) {
      if (!wasOpen.current) {
        returnTo.current = document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
        titleRef.current?.focus({ preventScroll: true });
      }
      wasOpen.current = true;
    } else if (wasOpen.current) {
      wasOpen.current = false;
      const el = returnTo.current;
      returnTo.current = null;
      el?.focus({ preventScroll: true });
    }
  }, [field]);
  // Esc closes while open
  useEffect(() => {
    if (!field) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        cbRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [field]);

  return (
    <aside className={`inspector${field ? ' open' : ''}`} aria-label="Field inspector" aria-hidden={!field}>
      {field && (
        <>
          <div className="inspector-top">
            <div>
              <h2 ref={titleRef} tabIndex={-1} style={{ outline: 'none' }}>Field at RA {fmtRa(field.ra)}, Dec {fmtDec(field.dec)}</h2>
              <p className="insp-id mono">{field.planning}, detector {field.detector}</p>
            </div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close inspector">
              <Icon name="x" />
            </button>
          </div>
          <div className="insp-body">
            <dl className="kv mono">
              <dt>Epochs</dt><dd>{field.epochs >= 5 ? '5+' : field.epochs}</dd>
              <dt>Bands present</dt><dd>{field.bands} of 6</dd>
              <dt>Survey</dt><dd>{field.survey}</dd>
            </dl>
            {field.epochs === 0 && (
              <>
                <span className="badge">Not observed yet</span>
                <p className="insp-note">SPHEREx hasn&apos;t visited this field, so there is nothing to compare.</p>
              </>
            )}
            {field.epochs === 1 && (
              <>
                <span className="badge">One epoch so far</span>
                <p className="insp-note">A blink needs at least two epochs of the same field.</p>
              </>
            )}
            {field.epochs >= 2 && field.hasCandidate && (
              <span className="badge unknown"><span className="dot" /> Known mover here — blink it</span>
            )}
            {field.epochs >= 2 && !field.hasCandidate && (
              <span className="badge">{field.epochs} visits — blink to look yourself</span>
            )}
            <button type="button" className="btn primary block" onClick={onOpenBlink} disabled={field.epochs < 2 || !blinkId}>
              {blinkId ? 'Open blink view' : 'No blinkable field here yet'}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

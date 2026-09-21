'use client';

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
  return (
    <aside className={`inspector${field ? ' open' : ''}`} aria-label="Field inspector" aria-hidden={!field}>
      {field && (
        <>
          <div className="inspector-top">
            <div>
              <h2>Field at RA {fmtRa(field.ra)}, Dec {fmtDec(field.dec)}</h2>
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
              <span className="badge unknown"><span className="dot" /> Flagged candidate here</span>
            )}
            {field.epochs >= 2 && !field.hasCandidate && (
              <span className="badge">No motion flagged</span>
            )}
            <button type="button" className="btn primary block" onClick={onOpenBlink} disabled={field.epochs < 2 || !blinkId}>
              {blinkId ? 'Open blink view' : 'No blinkable showcase here yet'}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

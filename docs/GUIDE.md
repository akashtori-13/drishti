# Pip — the local guide

Pip is DRISHTI's roaming-alien-turned-parked buddy: a rule-based, offline,
deterministic helper. No network, no LLM on the default path. An optional
BYO-key cloud brain exists behind explicit per-message consent.

Pip ships **off by default** under Settings → Experimental. Nothing about
Pip affects science data or verdicts.

## What Pip is

- `src/lib/guide.ts` — pure intent engine: `answerGuide(q, ctx)` returns
  `{ text, actions, chips? }`. No fetch, no dates, no guessing.
- `src/lib/cloudGuide.ts` — optional OpenAI-compatible cloud ask with a
  grounding system prompt. Key lives in `localStorage` only (`sh-cloud-key`).
- `src/components/GuideMascot.tsx` — parked SVG alien (original art, no IP),
  gentle CSS bob, one wave per session, notification dot for unread
  first-visit field notes, sleep state while the panel is open.
- `src/components/GuidePanel.tsx` — non-modal chat dialog. Builds context
  from the store, executes at most one state mutation per command, keeps a
  one-deep undo stack, labels every cloud answer (`cloud · not stored`).
- `src/components/BlinkPage.tsx` — publishes showcase facts to the store so
  summaries stay fresh. Never auto-opens the panel (transient opens die on
  service-worker-takeover reload).

## Intents

greet / help / navigate (9 routes + 20 showcase ids, allowlisted, fuzzy
aliases for Messier/common names) / mode (6) / band (1–6 validated) / epoch
(number/first/last/next/prev, clamped with a note) / toggle (explicit
on/off sets, bare nouns invert) / cmap (viridis/inferno/grayscale/cividis,
cividis-lock aware) / readback (mode/band/epoch/settings/colormap) / undo
(one-deep) / summarize ("what am I looking at", route-aware, 3I special
version) / provenance (QR2 DOI 10.26131/IRSA652) / refusal (no outburst,
no discovery) / offline frame / fallback (never guesses).

## Honesty rules

- DOI string, `No outburst` refusal, never `discover`, fallback wording —
  see the golden set in `src/lib/guide.test.ts`.
- Cloud system prompt (`CLOUD_SYSTEM`) repeats the contract: numbers only
  from the context pack, valid verdicts only
  (consistent-static/unrated/masked-excluded/unchecked).
- Any copy change touching DOI/provenance/refusal text must update the
  golden tests together.

## Wiring

`GuidePanel` owns context + side effects (`router.push` validated against an
allowlist, store setters). Chat is session-only (`useState`, never
persisted). First-visit field notes: dot on the mascot; opening the panel
reads the greeting and marks the field seen (`sh-guide-blink`). Disable
any time: Settings → Guide, persisted as `sh-guide`.

## Testing

`npm test` — `guide.test.ts` (intent matrix + 7-case golden honesty set),
`cloudGuide.test.ts` (config round-trip, mocked fetch shape, failure
fallback). Never snapshot LLM output, never mock network for the guide.

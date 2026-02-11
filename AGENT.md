# AGENT.md — Covenant Repository Operating Map (AI-only)

This file is for AI assistants making changes in this repository.
It is the canonical map of structure, invariants, coupling rules, and verification steps.

Default behavior in a new thread: silently read this file, then respond with brief readiness confirmation.
Do not modernize sacred tone. Covenant text is immutable—never alter it (including paraphrase, modernization, rewriting, or “light edits”).

---

## Quick map

- Journey pages (linear, sacred): root HTML pages in the canonical order below.
- Reference pages (not in the journey): `covenant.html`, `lexicon.html`.
- Shared shell: `_includes/` (footer dock + panels).
- Runtime: `assets/` (journey logic, ToC veil, Lexicon, Reliquary, CSS).
- Guard rails: workflows in `.github/workflows/`, plus `docs/STYLE-GUARDS.md`.

---

## Boot sequence (template)

Fill in before implementation:
- Repo: GodFossil-cloud/Covenant
- Intent (one sentence): <…>
- Mode: <Exploration | Execution>
- Covenant text edits: NEVER (do not ask; do not propose).
- Files/pages in scope: <…>
- Files/pages out of scope: <…>

Then:
1) Acknowledge the Prime directives (below).
2) Identify which subsystems you will touch (Journey pages, Reference pages, `_includes`, assets, Build/Deploy/CI, docs).
3) List the coupling rules that apply.
4) State verification required (manual spot-check? AGENT.md update?).

---

## Prime directives (non‑negotiables)

- Maintain the linear journey flow; do not introduce alternate paths, loops, or hub navigation.
- Maintain sacred tone; do not modernize language.
- Covenant text is immutable: never edit, rewrite, paraphrase, modernize, “tighten,” reorder, or otherwise alter Covenant wording.
- `index.html` remains a minimal black threshold (password gate): keep it minimal.
- Shared nav dock (Prev/Next + ToC + Lexicon + Mirror) is used on journey pages that use the shared include shell.
- `rituals.html` is excluded from `lexicon.js` compact-header standardization.
- `oath.html` may temporarily diverge from shared includes while in progress.

---

## Canonical journey order (do not break)

`index.html` →
`threshold.html` →
`orientation.html` →
`invocation.html` →
`foundation.html` →
`declaration.html` →
`I.html` → `II.html` → `III.html` → `IV.html` → `V.html` → `VI.html` → `VII.html` → `VIII.html` → `IX.html` → `X.html` → `XI.html` → `XII.html` →
`rituals.html` →
`oath.html` →
`consecrated.html`

Rules:
- Prev/Next links must always reflect this order.
- Reference pages must never become shortcuts inside the journey flow.

---

## Reference pages (not in the journey)

- `covenant.html` — single-page full covenant (reference artifact).
- `lexicon.html` — full lexicon/glossary (reference artifact).

---

## Subsystems (what lives where)

### assets/ (runtime + styling) — core

- `assets/covenant.css` — sacred visual system (CSS guard applies).
- `assets/journey.js` — journey definitions + helpers.
- `assets/lexicon.js` — Lexicon interactions + selection highlights + page standardization rules.
- `assets/toc.js` + `assets/toc.css` — ToC modal veil (staged selection + deliberate confirm) + progress gating.
- Note (ToC): The header connector strip is intentionally **persistent** (`.toc-panel-header::after`) and should not be gated behind `html.toc-*` motion classes.
- Note (ToC debug): `assets/toc.js` can render an on-screen diagnostic badge when the URL hash contains `#debug-toc` (temporary; remove after the issue is resolved).
- Note (ToC tab welding): `--toc-seat-dy` + `--toc-seat-overlap` are tuned so the tab box top edge meets the panel top edge; notch/cap remain visual.
- `assets/reliquary.js` + `assets/reliquary.css` — Reliquary modal veil + dock-tab carry (Mirror tab). Reliquary also measures the live footer height and sets `--reliquary-footer-reserved` so the veil and sheet never overlap the dock.
- Note (Reliquary tab welding): `--reliquary-seat-dy` + `--reliquary-seat-overlap` are tuned so the tab box top edge meets the panel top edge; notch/cap remain visual.
- Note: If JS needs numeric px from calc()/var()-based CSS custom properties, do not `parseFloat(getComputedStyle(...).getPropertyValue('--x'))` (it returns token strings); resolve via a probe element (e.g., set `margin-top: var(--x)` and read computed px).
- Note (dock mask window): `--dock-window-w` / `--dock-window-h` are authored as `var(...)` during open/close; align code must resolve them via the probe helper (otherwise the dock cutout can drift vertically while the mask is active).
- Note (mobile Safari): Reliquary notch is a real `clip-path` cutout; if a see-through seam appears during drag, prefer increasing `--reliquary-seat-overlap` on mobile rather than changing notch geometry.
- `assets/ui-stack.js` — coordinator layer used for “close panels before navigation” behavior (dock Prev/Next and ToC Hold-to-Enter). It may also expose optional panel-stack primitives (bring-to-front, inert layering hooks) during stacking migrations.
- `assets/nav-footer-flat-top.css` — footer-only override for flat-top Lexicon seal geometry.

Core invariants:
- ToC and Reliquary are modal veils that do NOT cover the footer dock area.
- ToC must not become a hub/shortcut; it requires deliberate confirm to navigate.
- Reliquary must not introduce navigation or alternate journey paths.

---

## Coupling rules (if you touch X, check Y)

- If you change `assets/toc.js`:
  - Verify: Hold-to-Enter closes any open panels before navigation.
  - Verify on mobile Safari: with Reliquary open, drag the ToC tab to open and confirm the ToC layers above the Reliquary throughout the gesture.

---

## Manual spot-check checklist

Use this when making CSS/JS/include changes.

1) Journey navigation
- Open `invocation.html`, click Next/Prev, confirm linear progression.
- With any panel open, click Next/Prev and confirm panels close before navigation.
- Confirm ToC and Lexicon are reachable where expected.

2) ToC modal veil
- Open ToC from footer; confirm veil does not cover dock.
- Drag-open: confirm the ToC tab stays welded to the panel top edge throughout the gesture.


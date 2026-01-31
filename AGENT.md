# AGENT.md — Covenant Repository Operating Map (AI-only)

This file is for AI assistants making changes in this repository.
It is the canonical map of structure, invariants, coupling rules, and verification steps.

Default behavior in a new thread: silently read this file, then respond with brief readiness confirmation.
Do not modernize sacred tone or alter Covenant text unless explicitly requested.

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
- Allowed Covenant text edits? (yes/no): <…>
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
- Maintain sacred tone; do not modernize language or alter Covenant text unless explicitly requested.
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
- `assets/reliquary.js` + `assets/reliquary.css` — Reliquary modal veil + dock-tab carry (Mirror tab). Reliquary also measures the live footer height and sets `--reliquary-footer-reserved` so the veil and sheet never overlap the dock.

Core invariants:
- ToC and Reliquary are modal veils that do NOT cover the footer dock area.
- ToC must not become a hub/shortcut; it requires deliberate confirm to navigate.
- Reliquary must not introduce navigation or alternate journey paths.

### _includes/ (shared HTML shell) — core

Key includes:
- `_includes/head-fonts.html`
- `_includes/covenant-config.html`
- `_includes/nav-footer.html` (dock: Prev/Next + ToC + Lexicon + Mirror)
- `_includes/toc-panel.html`
- `_includes/lexicon-panel.html`
- `_includes/reliquary-panel.html`

If include structure changes, verify every journey page that uses the shell.

### Build / Deploy / CI

- `.github/workflows/pages.yml` — Jekyll build + deploy to GitHub Pages; builds into `_site` and writes `_site/.nojekyll`.
- `.github/workflows/css-guard.yml` — validates `covenant.css` integrity markers and structure.
- `.github/workflows/agent-guard.yml` — requires `AGENT.md` update when core files change.
- `_config.yml` — Jekyll behavior (include/exclude).

Docs:
- `docs/STYLE-GUARDS.md` — `covenant.css` integrity requirements and architectural markers.

---

## Coupling rules (if you touch X, check Y)

- If you change any journey page:
  - Verify Prev/Next links on that page and adjacent pages.
  - Verify ToC and Lexicon still open/close and do not cover the dock.

- If you change `_includes/nav-footer.html`:
  - Verify dock layout on desktop + mobile.
  - Verify the control IDs remain present: `tocToggle`, `lexiconToggle`, `mirrorToggle`.

- If you change `_includes/reliquary-panel.html`:
  - Verify the required anchors remain present: `reliquaryPanel`, `reliquaryOverlay`, `reliquaryDragRegion`.

- If you change `assets/reliquary.js` or `assets/reliquary.css`:
  - Verify veil does not cover footer dock.
  - Verify drag-open/drag-close on mobile.
  - Verify focus trap + ESC close returns focus to `#mirrorToggle`.
  - Note: Reliquary will attempt to close the ToC by clicking `#tocToggle` when opening; if ToC wiring changes, re-test this interaction.

- If you change `assets/lexicon.js`:
  - Verify Lexicon open/close, overlay click close, ESC close (if implemented), and selection highlights.
  - Verify `rituals.html` remains excluded from compact-header standardization.

- If you change `assets/toc.js` or `assets/toc.css`:
  - Verify veil does not cover footer dock.
  - Verify staged selection + deliberate confirm.
  - Verify progress gating still blocks locked direct-access.

- If you change `assets/covenant.css`:
  - Preserve CSS guard markers (do not truncate or reorder guarded regions).
  - Preserve the footer “Obsidian & Gold Leaf” region per `docs/STYLE-GUARDS.md`.

- If you change build/deploy files (`pages.yml`, `_config.yml`, guards):
  - Ensure the site still builds and deploys via the Pages workflow.

---

## Manual spot-check checklist

Use this when making CSS/JS/include changes.

1) Journey navigation
- Open `invocation.html`, click Next/Prev, confirm linear progression.
- Confirm ToC and Lexicon are reachable where expected.

2) Lexicon panel + overlay
- Toggle Lexicon open/close.
- Overlay click closes.
- ESC closes (if implemented).
- Confirm ToC is not visible while Lexicon is open (if that is the intended behavior).

3) ToC modal veil
- Open ToC from footer; confirm veil does not cover dock.
- Select an unlocked entry; confirm it stages.
- Hold confirm to enter; release early cancels.
- ESC closes and focus returns to the ToC control.
- Tab/Shift+Tab keep focus trapped in the panel.

4) Reliquary modal veil
- Open Reliquary from Mirror; confirm veil does not cover dock.
- ESC closes and focus returns to the Mirror control.
- On mobile: drag Mirror tab upward to open; drag down from sheet handle to close.

5) Selection highlights
- On an Article page (`I.html` or `III.html`): click subsection and subpart markers (Ⓐ/Ⓑ/Ⓒ) and confirm expected highlight behavior.

6) Footer system
- Confirm footer colors/frames/seals render correctly.
- Confirm mobile behavior does not trap scroll or hide the dock.

7) Rituals exclusion
- Open `rituals.html` and confirm compact-header exclusion still applies.

---

## When to update AGENT.md (same change-set)

Update this file if you change any of:
- Linear flow order, filenames, or navigation rules.
- Shared includes or shared JS/CSS responsibilities.
- Build/deploy workflows or `_config.yml` behavior.
- Any newly discovered coupling rule (X breaks Y).

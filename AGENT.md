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

Core runtime files:
- `assets/covenant.css` — sacred visual system (CSS guard applies).
- `assets/footer-overrides.css` — head-loaded footer geometry + tone overrides (Lexicon flat-top seal + small contrast nudges).
- `assets/journey.js` — journey definitions + helpers.
- `assets/lexicon.js` — Lexicon interactions + selection highlights + page standardization rules.
- `assets/toc.js` + `assets/toc.css` — ToC modal veil (staged selection + deliberate confirm) + progress gating.
- `assets/reliquary.js` + `assets/reliquary.css` — Reliquary modal veil + dock-tab interactions (Mirror tab).
- `assets/ui-stack.js` — coordinator layer used for “close panels before navigation” behavior (dock Prev/Next and ToC Hold-to-Enter).
- `assets/textures/` — static texture assets.

Notes:
- Note (ToC CSS): Keep all ToC-related styling (including any motion/mask fixes) inside `assets/toc.css`; do not split ToC fixes into extra stylesheets.
- Note (ToC): The header connector strip is intentionally **persistent** (`.toc-panel-header::after`) and should not be gated behind `html.toc-*` motion classes.
- Note (ToC deliberate confirm): The ToC uses staged selection + deliberate confirm; the confirm surface is the staged entry itself (hold-to-enter), not a separate header button.
- Note (ToC dock tab): ToC tab rides with the ToC sheet during drag + snap (Lexicon-style carry offsets). The dock socket remains visible beneath.
- Note (Reliquary dock tab): Mirror tab rides with the Reliquary sheet during drag + snap (Lexicon-style carry offsets). The dock socket remains visible beneath.
- Note (ToC positioning): Avoid `Math.floor()` when computing the mobile sheet height from `visualViewport.height`; it can create a 1px top gap.
- Note (footer bookends spacing): `--toc-tab-gap` in `assets/footer-overrides.css` controls ToC/Mirror distance from the center; mobile bookend nudges live in `assets/footer-overrides.css` and the `navFooterCritical` fallback in `_includes/nav-footer.html`.
- Note (footer bookends vertical seat): `--dock-tab-raise` is defined in `assets/toc.css`; the mobile first-paint fallback may override it on `#navFooter` in `assets/footer-overrides.css`.
- Note (Reliquary drag shell): During drag-open, the panel/overlay may be visible before `html.reliquary-open` is set; Lexicon dimming is handled via `html.reliquary-dragging` (active drag) and `html.reliquary-open` (committed open) so a cancelled drag re-enables immediately on release.
- Note: If JS needs numeric px from calc()/var()-based CSS custom properties, do not `parseFloat(getComputedStyle(...).getPropertyValue('--x'))` (it returns token strings); resolve via a probe element (e.g., set `margin-top: var(--x)` and read computed px).
- Note (dock mask window): Dock-window mask choreography is removed in favor of **panel-only** motion. `dock-window` / `--dock-window-*` tokens should not exist in runtime CSS unless explicitly requested.
- Note (mobile Safari): Reliquary notch is a real `clip-path` cutout; if a see-through seam appears during drag, prefer increasing `--reliquary-seat-overlap` on mobile rather than changing notch geometry.
- Note (ui-stack / iOS Safari): Avoid DOM/state changes that reflow the footer during drag-open shells; Lexicon “locked” visuals should apply only when ToC/Reliquary are *committed open* to prevent a ~1px dock hop.
- Note (ui-stack / iOS dock gesture guard): The iOS Safari dock-drag scroll/rubber-band guard is implemented inside `assets/ui-stack.js` (not as a separate asset file). Keep it iOS-only, non-invasive, and ensure panel bodies remain scrollable.
- Note (iOS dock tabs): Avoid 1px `:active` press-jumps on `#tocToggle`/`#mirrorToggle`; it reads like the iOS Safari dock hop.
- Note (ui-stack / shared scroll lock): ToC scroll-lock should engage only when ToC is *committed open* (`html.toc-open`, not during `toc-opening`/`toc-closing`/drag shells); ui-stack auto-syncs from DOM class changes so lock timing can follow motion classes.
- Note (scroll lock): Prefer overflow-only locking (`overflow:hidden` + `height:100%` on `html.<lock>`, and `overflow:hidden` + `height:100%` on `html.<lock> body`); avoid `position:fixed` body-locking, which can trigger iOS Safari compositor hop and awkward scroll restoration.
- (Removed) `assets/tab-weld.js` — legacy tab/panel welding loop (old system); do not reintroduce tab-weld assets or includes unless explicitly requested.

#### Dock-tab carry verification

ToC + Reliquary tabs ride with their panels during drag/tap/snap; the dock sockets remain visible beneath.

- Manual verification (run after each behavioral commit): ToC drag/tap (tab rides, returns cleanly); Reliquary drag/tap (tab rides, returns cleanly); overlay never covers dock; close-panels-before-navigation; ESC + focus return; stacking (ToC above Reliquary during drag); mobile Safari compositor stability (no ~1px dock hop)

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

Deployment notes:
- This is a GitHub Pages *project site* served at `/Covenant/`.
- `_includes/covenant-config.html` uses relative `assets/...` URLs (not `relative_url`) so the runtime loads correctly both under `/Covenant/` and under custom domains.

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

- If you change `assets/ui-stack.js`:
  - Verify: with any panel open, clicking dock Prev/Next closes panels first, then navigates.
  - Verify: UI stack z-index remains below the dock lift (~1600) so panels/scrims never overlay the footer during drag/open/close.
  - iOS Safari: re-test drag-open/drag-close ToC + Reliquary for compositor stability (no ~1px dock tick); confirm panel bodies still scroll.

- If you change `assets/toc.js`:
  - Verify: Hold-to-Enter closes any open panels before navigation.
  - Verify on mobile Safari: with Reliquary open, drag the ToC tab to open and confirm the ToC layers above the Reliquary throughout the gesture.
  - Note: ToC UI-stack `isOpen()` should be derived from panel state (`.is-open`/`.is-dragging`/`.is-closing`) rather than root motion classes (e.g. `toc-opening`/`toc-closing`), to avoid leaving other panels inert.
  - Note: During drag-open, set `.is-dragging` before calling `noteOpenToUIStack()` so z-index assignment is correct from frame 0.
  - Note: Keep `html.toc-open` in sync with committed open state (set on open/commit; clear only after fully closed); `assets/toc.css` uses it for footer lift/fade and header title padding.

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
  - Verify locked direct URL visits do not advance `covenant_progress` or unlock intervening pages.
  - Verify ToC header band visually blends with the ToC tab face (no jarring seam).
  - Verify ToC panel reaches the top cleanly on mobile (no ~1px gap).
  - Note: ToC will attempt to close the Reliquary by clicking `#mirrorToggle` when opening; if Reliquary wiring changes, re-test this interaction.

- If you change `assets/covenant.css`:
  - Preserve CSS guard markers (do not truncate or reorder guarded regions).
  - Preserve the footer “Obsidian & Gold Leaf” region per `docs/STYLE-GUARDS.md`.
  - Note (iOS Safari): keep `.nav-footer` pre-promoted as a stable layer (`translateZ(0)` + `backface-visibility: hidden`) to prevent a ~1px compositor hop when drag-opening panels.

- If you change build/deploy files (`pages.yml`, `_config.yml`, guards):
  - Ensure the site still builds and deploys via the Pages workflow.

---

## Manual spot-check checklist

Use this when making CSS/JS/include changes.

1) Journey navigation
- Open `invocation.html`, click Next/Prev, confirm linear progression.
- With any panel open, click Next/Prev and confirm panels close before navigation.
- Confirm ToC and Lexicon are reachable where expected.

2) Lexicon panel + overlay
- Toggle Lexicon open/close.
- Overlay click closes.
- ESC closes (if implemented).
- Confirm ToC is not visible while Lexicon is open (if that is the intended behavior).

3) ToC modal veil
- Open ToC from footer; confirm veil does not cover dock.
- Confirm ToC header band visually blends with the ToC tab face.
- Confirm ToC sheet reaches the top cleanly on mobile (no 1px gap).
- Select an unlocked entry; confirm it stages.
- Hold the staged entry to enter; release early cancels.
- Confirm Hold-to-Enter closes panels before navigation.
- ESC closes and focus returns to the ToC control.
- Tab/Shift+Tab keep focus trapped in the panel.
- Drag-open: confirm the ToC tab rides with the ToC panel, and returns cleanly on close/cancel.
- If Reliquary is open, opening ToC closes Reliquary first (no stacked scroll locks).
- Attempt to visit a locked later journey page by URL; confirm redirect occurs and ToC progress does not unlock intervening pages.

4) Reliquary modal veil
- Open Reliquary from Mirror; confirm veil does not cover footer dock.
- ESC closes and focus returns to the Mirror control.
- On mobile: drag Mirror tab upward to open; drag down from sheet handle to close.
- Drag-open: confirm the Mirror tab rides with the Reliquary panel, and returns cleanly on close/cancel.
- If ToC is open, opening Reliquary closes ToC first (no stacked scroll locks).
- Drag-open cancel (release early): confirm Lexicon seal returns to normal immediately on release.

5) Selection highlights
- On an Article page (`I.html` or `III.html`): click subsection and subpart markers (Ⓐ/Ⓑ/Ⓒ) and confirm expected highlight behavior.

6) Footer system
- Confirm footer colors/frames/seals render correctly.
- Confirm mobile behavior does not trap scroll or hide the dock.
- Click the citation label beneath the Lexicon seal; confirm it copies the citation text and briefly whispers “Copied”.

7) Rituals exclusion
- Open `rituals.html` and confirm compact-header exclusion still applies.

---

## When to update AGENT.md (same change-set)

Update this file if you change any of:
- Linear flow order, filenames, or navigation rules.
- Shared includes or shared JS/CSS responsibilities.
- Build/deploy workflows or `_config.yml` behavior.
- Any newly discovered coupling rule (X breaks Y).

# AGENT.md — Covenant Repository Operating Map (AI-only)

Canonical map of structure, invariants, coupling rules, and verification steps for AI assistants working in this repository. [cite:1]

Default behavior in a new thread: silently read this file, then respond with brief readiness confirmation. [cite:1]
Do not modernize sacred tone or alter Covenant text unless explicitly requested. [cite:1]

---

## Quick map

- Journey pages (linear, sacred): root HTML pages in the canonical order below. [cite:1][cite:3]
- Reference pages (not in the journey): `covenant.html`, `lexicon.html`. [cite:1][cite:3]
- Shared shell: `_includes/` (footer dock + panels). [cite:1][cite:5]
- Runtime: `assets/` (journey logic, ToC veil, Lexicon, Reliquary, CSS). [cite:1][cite:6]
- Guard rails: workflows in `.github/workflows/`, plus `docs/STYLE-GUARDS.md`. [cite:1][cite:2][cite:4]

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

- Maintain the linear journey flow; do not introduce alternate paths, loops, or hub navigation. [cite:1]
- Maintain sacred tone; do not modernize language or alter Covenant text unless explicitly requested. [cite:1]
- `index.html` remains a minimal black threshold (password gate): keep it minimal. [cite:1]
- Shared nav dock (Prev/Next + ToC + Lexicon + Mirror) is used on journey pages that use the shared include shell. [cite:1][cite:9]
- `rituals.html` is excluded from `lexicon.js` compact-header standardization. [cite:1]
- `oath.html` may temporarily diverge from shared includes while in progress. [cite:1]

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
`consecrated.html` [cite:1]

Rules:
- Prev/Next links must always reflect this order. [cite:1]
- Reference pages must never become shortcuts inside the journey flow. [cite:1]

---

## Reference pages (not in the journey)

- `covenant.html` — single-page full covenant (reference artifact). [cite:1][cite:3]
- `lexicon.html` — full lexicon/glossary (reference artifact). [cite:1][cite:3]

---

## Subsystems (what lives where)

### assets/ (runtime + styling) — core

- `assets/covenant.css` — sacred visual system (CSS guard applies). [cite:1][cite:6]
- `assets/journey.js` — journey definitions + helpers. [cite:1][cite:6]
- `assets/lexicon.js` — Lexicon interactions + selection highlights + page standardization rules. [cite:1][cite:6]
- `assets/toc.js` + `assets/toc.css` — ToC modal veil (staged selection + deliberate confirm) + progress gating. [cite:1][cite:6]
- `assets/reliquary.js` + `assets/reliquary.css` — Reliquary modal veil + dock-tab carry (Mirror tab). [cite:1][cite:6][cite:7]

Core invariants:
- ToC and Reliquary are modal veils that do NOT cover the footer dock area. [cite:1]
- ToC must not become a hub/shortcut; it requires deliberate confirm to navigate. [cite:1]
- Reliquary must not introduce navigation or alternate journey paths. [cite:1]

### _includes/ (shared HTML shell) — core

Key includes:
- `_includes/head-fonts.html` [cite:1][cite:5]
- `_includes/covenant-config.html` [cite:1][cite:5]
- `_includes/nav-footer.html` (dock: Prev/Next + ToC + Lexicon + Mirror) [cite:1][cite:9]
- `_includes/toc-panel.html` [cite:1][cite:5]
- `_includes/lexicon-panel.html` [cite:1][cite:5]
- `_includes/reliquary-panel.html` [cite:1][cite:8]

If include structure changes, verify every journey page that uses the shell. [cite:1]

### Build / Deploy / CI

- `.github/workflows/pages.yml` — Jekyll build + deploy to GitHub Pages; builds into `_site` and writes `_site/.nojekyll`. [cite:1][cite:4]
- `.github/workflows/css-guard.yml` — validates `covenant.css` integrity markers and structure. [cite:1][cite:4]
- `.github/workflows/agent-guard.yml` — requires `AGENT.md` update when core files change. [cite:1][cite:4]
- `_config.yml` — Jekyll behavior (include/exclude). [cite:1][cite:3]

Docs:
- `docs/STYLE-GUARDS.md` — `covenant.css` integrity requirements and architectural markers. [cite:1][cite:2]

---

## Coupling rules (if you touch X, check Y)

- If you change any journey page:
  - Verify Prev/Next links on that page and adjacent pages. [cite:1]
  - Verify ToC and Lexicon still open/close and do not cover the dock. [cite:1]

- If you change `_includes/nav-footer.html`:
  - Verify dock layout on desktop + mobile. [cite:1][cite:9]
  - Verify the control IDs remain present: `tocToggle`, `lexiconToggle`, `mirrorToggle`. [cite:9]

- If you change `_includes/reliquary-panel.html`:
  - Verify the required anchors remain present: `reliquaryPanel`, `reliquaryOverlay`, `reliquaryDragRegion`. [cite:8][cite:7]

- If you change `assets/reliquary.js` or `assets/reliquary.css`:
  - Verify veil does not cover footer dock. [cite:1]
  - Verify drag-open/drag-close on mobile. [cite:1][cite:7]
  - Verify focus trap + ESC close returns focus to `#mirrorToggle`. [cite:1][cite:7]
  - Note: Reliquary will attempt to close the ToC by clicking `#tocToggle` when opening; if ToC wiring changes, re-test this interaction. [cite:7][cite:9]

- If you change `assets/lexicon.js`:
  - Verify Lexicon open/close, overlay click close, ESC close (if implemented), and selection highlights. [cite:1]
  - Verify `rituals.html` remains excluded from compact-header standardization. [cite:1]

- If you change `assets/toc.js` or `assets/toc.css`:
  - Verify veil does not cover footer dock. [cite:1]
  - Verify staged selection + deliberate confirm. [cite:1]
  - Verify progress gating still blocks locked direct-access. [cite:1]

- If you change `assets/covenant.css`:
  - Preserve CSS guard markers (do not truncate or reorder guarded regions). [cite:1]
  - Preserve the footer “Obsidian & Gold Leaf” region per `docs/STYLE-GUARDS.md`. [cite:1][cite:2]

- If you change build/deploy files (`pages.yml`, `_config.yml`, guards):
  - Ensure the site still builds and deploys via the Pages workflow. [cite:1][cite:4]

---

## Manual spot-check checklist

Use this when making CSS/JS/include changes. [cite:1]

1) Journey navigation
- Open `invocation.html`, click Next/Prev, confirm linear progression. [cite:1]
- Confirm ToC and Lexicon are reachable where expected. [cite:1]

2) Lexicon panel + overlay
- Toggle Lexicon open/close. [cite:1]
- Overlay click closes. [cite:1]
- ESC closes (if implemented). [cite:1]
- Confirm ToC is not visible while Lexicon is open (if that is the intended behavior). [cite:1]

3) ToC modal veil
- Open ToC from footer; confirm veil does not cover dock. [cite:1]
- Select an unlocked entry; confirm it stages. [cite:1]
- Hold confirm to enter; release early cancels. [cite:1]
- ESC closes and focus returns to the ToC control. [cite:1]
- Tab/Shift+Tab keep focus trapped in the panel. [cite:1]

4) Reliquary modal veil
- Open Reliquary from Mirror; confirm veil does not cover dock. [cite:1]
- ESC closes and focus returns to the Mirror control. [cite:1]
- On mobile: drag Mirror tab upward to open; drag down from sheet handle to close. [cite:1]

5) Selection highlights
- On an Article page (`I.html` or `III.html`): click subsection and subpart markers (Ⓐ/Ⓑ/Ⓒ) and confirm expected highlight behavior. [cite:1]

6) Footer system
- Confirm footer colors/frames/seals render correctly. [cite:1]
- Confirm mobile behavior does not trap scroll or hide the dock. [cite:1]

7) Rituals exclusion
- Open `rituals.html` and confirm compact-header exclusion still applies. [cite:1]

---

## When to update AGENT.md (same change-set)

Update this file if you change any of: [cite:1]
- Linear flow order, filenames, or navigation rules. [cite:1]
- Shared includes or shared JS/CSS responsibilities. [cite:1]
- Build/deploy workflows or `_config.yml` behavior. [cite:1]
- Any newly discovered coupling rule (X breaks Y). [cite:1]

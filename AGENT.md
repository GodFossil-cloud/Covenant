# AGENT.md — Covenant Repository Operating Map (AI-only)

This file exists exclusively for AI assistants making changes in this repository.
It is the canonical, update-in-tandem map of structure, invariants, coupling rules, and verification steps.

If any change affects architecture, shared behaviors, navigation, build/deploy, or sacred constraints:
- Update AGENT.md in the same change-set.
- Prefer minimal, localized edits.
- Never “normalize” sacred tone into modern product language.

---

## Boot Sequence (required thread opener)

Use this as the first message in a new thread (or at the beginning of a new work session) before implementation.

Default behavior (for casual conversation): silently read AGENT.md at the start of a thread, then respond with a brief readiness confirmation only.
Do not recite this boot sequence unless the user requests it.

**Important:** This boot sequence is not meant to suppress creative exploration.
It is meant to ensure that exploration and implementation stay aligned with sacred constraints, linear flow, and repo coupling.

### Covenant Assistant Boot Sequence (v1)

INPUTS:
- Repo: GodFossil-cloud/Covenant
- Intent: <one sentence>
- Mode: <Exploration | Execution>
- Allowed Covenant text edits? (yes/no): <...>
- Files/pages in scope: <...>
- Files/pages out of scope: <...>

PHASE 0 — LOAD CANON
1) Read this AGENT.md and treat it as canonical.

PHASE 1 — ACKNOWLEDGE LAWS
2) Echo the Prime Directives you will obey (as bullets).

PHASE 2 — MAP SCOPE → SUBSYSTEMS
3) Classify the request as touching one or more subsystems:
- Journey pages (linear flow)
- Reference pages (covenant.html / lexicon.html)
- _includes (shared shell)
- assets (CSS/JS/TOC/Lexicon/Journey runtime)
- Build/deploy (_config.yml, Pages workflow)
- CI guards
- docs/

PHASE 3 — COUPLING RULES (X → Y)
4) List the top 3–6 coupling rules that apply, in this format:
- If I change X, I must verify/update Y, because <one short reason>.

PHASE 4 — VERIFICATION PLAN
5) State which verification is required:
- Manual spot-check checklist required? (yes/no) + why.
- AGENT.md update required? (yes/no) + why.

PHASE 5 — RESPONSE BEHAVIOR (MODE-DEPENDENT)
6) If Mode = Exploration:
- Provide 3–10 ideas/opportunities.
- Clearly mark any ideas that would require sacred-text edits or that risk linear-flow changes.
- No code changes unless explicitly asked.

7) If Mode = Execution:
- Provide a minimal change plan (files to edit, what will change/not change, risks).
- Ask for permission before making repo writes.

---

## Prime directives (non‑negotiables)

- Maintain the linear journey flow and do not introduce alternate paths, loops, or hub navigation.
- Maintain sacred tone. Do not modernize language or alter Covenant text unless explicitly requested.
- index.html is a minimal black threshold (password gate): keep it minimal.
- Shared nav dock (prev/next + Lexicon + TOC) is used on journey pages that use the shared include shell.
- rituals.html is excluded from lexicon.js compact-header standardization (even if it uses dock/shell).
- oath.html may temporarily diverge from shared includes while in-progress.

---

## Build + deploy reality

- Site is built with Jekyll via GitHub Actions (`.github/workflows/pages.yml`) into `_site`.
- The workflow creates `_site/.nojekyll` to prevent GitHub Pages from attempting a second Jekyll build.
- Jekyll behavior is controlled by `_config.yml` (include/exclude rules).

Do not rely on GitHub Pages “auto-Jekyll build” assumptions; the workflow is the truth.

---

## Repository map

### Root journey pages (linear flow)

Canonical order (do not break):

index.html →
threshold.html →
orientation.html →
invocation.html →
foundation.html →
declaration.html →
I.html → II.html → III.html → IV.html → V.html → VI.html → VII.html → VIII.html → IX.html → X.html → XI.html → XII.html →
rituals.html →
oath.html →
consecrated.html

Rules:
- Prev/next links must always reflect this order.
- Reference pages must never become “shortcuts” inside the journey flow.

### Root reference pages (not in linear flow)

- covenant.html — single-page full covenant (reference artifact).
- lexicon.html — full lexicon/glossary (reference artifact).

These can evolve, but must not undermine the journey’s linear integrity.

### /assets (shared runtime + styling)  ⚠️ Core

Files present:
- assets/covenant.css
- assets/lexicon.js
- assets/toc.js
- assets/journey.js
- assets/toc.css
- assets/reliquary.js
- assets/reliquary.css
- assets/textures/

Responsibilities:
- covenant.css: core site styling and sacred visual system.
- lexicon.js: Lexicon interactions + sentence/subpart highlights + page standardization rules.
- toc.js + toc.css: Table-of-Contents modal veil + progress gating + deliberate navigation.
- reliquary.js + reliquary.css: Reliquary modal veil + dock-tab carry (Mirror tab).

### ToC subsystem status (Jan 2026)

Primary files:
- assets/toc.js (Table-of-Contents runtime: modal veil, focus trap, selection staging + confirm).
- assets/toc.css (ToC visuals, veil + panel + footer choreography).
- _includes/toc-panel.html (ToC overlay + panel shell; produced header/title bar).
- _includes/nav-footer.html (dock integration; ToC seal lives in footer, left of Lexicon seal).

Core behaviors / invariants:
- The ToC is a modal veil that does NOT cover the footer dock area.
- The ToC control is a footer “seal” button (`#tocToggle`) placed left of `#lexiconToggle`.
- Navigation safety:
  - Selecting an entry stages it (pending highlight) and requires a deliberate confirm before navigating.
  - Locked entries are non-navigable and show the “In due time…” feedback.
- Progress gating:
  - Stores `covenant_progress` in localStorage (max unlocked index).
  - `enforceSoftGate()` redirects locked direct-access attempts back to `invocation.html`.

Recent dock UI refinements (Jan 18, 2026):
- The footer seal cluster is now explicitly symmetric: `.nav-seals` is a 3-column grid (ToC tab, Lexicon seal, Mirror tab) using `--toc-tab-width` columns in `assets/toc.css`.
- The ToC + Mirror tabs are visually raised via `--dock-tab-raise` and `transform: translateY(...)`.
- The ToC + Mirror tabs were refined to be slightly smaller (`--dock-tab-width`, `--dock-tab-height`) while keeping the grid columns constant.
- The tab face and framing were darkened and thickened:
  - `::after` uses a dedicated base tone `--dock-tab-face` plus gradient layers.
  - `::before` border is split so the top edge matches `--dock-tab-face`, while left/right/bottom are `#3B362B`.
- Top corners were sharpened independently via `--dock-tab-radius-top` (applied to the button + `::before` + `::after`).

Do not change lightly:
- Do not allow the ToC to become a hub or shortcut.
- Any change to footer dock layering or overlays can make the seals look “washed” or sliced.

Implementation breadcrumbs (commits):
- Dock symmetry + fixed wing sizing (Prev/Next): https://github.com/GodFossil-cloud/Covenant/commit/6562bd52a5333aadbd855c9608dba14444911a17
- Raise ToC/Mirror tabs: https://github.com/GodFossil-cloud/Covenant/commit/146775a2de2d495975712a12ac6d339bdb0b4d51
- Tab size/darkness/border/radius refinement: https://github.com/GodFossil-cloud/Covenant/commit/fb24392df20436f068a072cb31688f8eb6d7eb3d
- Fix `.toc-produced` selector typo: https://github.com/GodFossil-cloud/Covenant/commit/d599d3ea4ac8bbc9acf3c3f2d4902874db68c6da
- Tab border edge-color split + face token: https://github.com/GodFossil-cloud/Covenant/commit/d9879eff90d85627154d6ec5e0b587b9f71fc284

- journey.js: journey-wide runtime behaviors (journey definition + helpers).

### Reliquary subsystem status (Jan 2026)

Primary files:
- assets/reliquary.js (Reliquary runtime: modal veil, focus trap, mobile drag-to-open/close).
- assets/reliquary.css (Reliquary visuals: veil + panel + dock-tab carry for `#mirrorToggle`).
- _includes/reliquary-panel.html (Reliquary overlay + panel shell).
- _includes/nav-footer.html (dock integration; Mirror tab lives right of `#lexiconToggle`).

Core behaviors / invariants:
- The Reliquary is a modal veil that does NOT cover the footer dock area.
- The Reliquary must not become navigation or introduce alternate journey paths.
- Mobile interaction mirrors the ToC’s "dock-tab carry" feel:
  - Drag/swipe on `#mirrorToggle` pulls the sheet upward.
  - When open, the tab is welded to the sheet’s top corner.
  - Drag down from the sheet handle closes.

---

## /_includes (shared HTML shell)  ⚠️ Core

Key includes (canonical intent; verify exact filenames in repo before editing):
- _includes/head-fonts.html (fonts + theme meta + config include)
- _includes/covenant-config.html (runtime defaults; loads TOC/journey assets)
- _includes/nav-footer.html (prev/next + Lexicon toggle + TOC seal; includes ToC panel)
- _includes/toc-panel.html (ToC overlay + panel shell, including the produced header/title bar)
- _includes/lexicon-panel.html (panel shell; JS populates content)
- _includes/reliquary-panel.html (panel shell; JS governs visibility)

If include structure changes, check every journey page that uses the shell.

### /docs (doctrine + guardrails)

- docs/STYLE-GUARDS.md — defines covenant.css integrity requirements and architectural markers.

### /.github/workflows (CI)

- css-guard.yml — validates covenant.css size + marker comments + brace balance.
- pages.yml — Jekyll build + deploy to GitHub Pages.
- agent-guard.yml — enforces this file’s update-in-tandem contract (added Jan 2026).

---

## Coupling rules (if you touch X, check Y)

- If you change any journey page:
  - Verify prev/next navigation in that page and adjacent pages.
  - Verify the TOC panel still opens/closes and does not cover nav controls.

- If you change `_includes/nav-footer.html`:
  - Verify nav dock layout on desktop + mobile.
  - Verify Lexicon toggle and ToC seal both behave, and do not overlap.
  - Verify citation label positioning.

- If you change `assets/lexicon.js`:
  - Verify Lexicon opens/closes, overlay behavior, selection highlights (sentence/subpart), and any “compact header standardization” scope exclusions (rituals.html).

- If you change `assets/toc.js` or `assets/toc.css`:
  - Verify modal veil does not cover the footer dock region.
  - Verify selection staging + deliberate confirm still work.
  - Verify progress gating still prevents locked direct access.

- If you change `assets/reliquary.js` or `assets/reliquary.css`:
  - Verify Reliquary modal veil does not cover the footer dock region.
  - Verify drag-open/drag-close does not interfere with ToC behavior.
  - Verify focus trap and ESC close still return focus to `#mirrorToggle`.

- If you change `assets/covenant.css`:
  - Ensure CSS guard markers remain intact and file is not truncated.
  - Confirm footer “Obsidian & Gold Leaf” region remains present and append-only per STYLE-GUARDS.

- If you change build/deploy (`pages.yml`, `_config.yml`):
  - Ensure the site still builds to `_site` and deploys via Pages workflow.

---

## Manual spot-check checklist (replaces deleted _visual-check.html)

Use this when making CSS/JS/include changes—fast, human-verifiable checks:

1) Journey navigation
- Open invocation.html, click Next/Prev, confirm linear progression is correct.
- Confirm “Lexicon” and “TOC” are reachable where expected.

2) Lexicon panel + overlay
- Toggle Lexicon open/close.
- Confirm overlay click closes.
- Confirm ESC closes (if implemented).
- Confirm ToC seal is not visible while Lexicon is open.

3) ToC modal veil
- Open the ToC from the footer seal; confirm the veil does not cover the dock.
- Select an unlocked entry; confirm it stages (pending highlight).
- Hold the confirm control to enter; confirm release-before-complete cancels.
- Press ESC; confirm the ToC closes and focus returns to the ToC seal.
- Tab / Shift+Tab: confirm focus stays trapped within the ToC panel.

4) Reliquary modal veil
- Open the Reliquary from the Mirror tab; confirm the veil does not cover the dock.
- Press ESC; confirm the Reliquary closes and focus returns to the Mirror tab.
- On mobile: drag the Mirror tab upward to open; drag down from the sheet handle to close.

5) Selection highlights (subsection/subpart/sentence)
- On a representative Article page (I.html or III.html):
  - Click a subsection: verify selected styling.
  - Click subpart markers (Ⓐ/Ⓑ/Ⓒ): verify independent selection styling.
  - If sentence highlighting exists: click a sentence; verify highlight.

6) Footer system
- Confirm footer colors/frames/seal render correctly.
- Confirm mobile behavior does not trap scroll or hide the dock.

7) Rituals exclusion
- Open rituals.html and confirm any “compact header” behavior that is excluded remains excluded.

---

## AGENT.md update contract

When making changes, update this file if any of the following change:
- Linear flow order, filenames, or nav rules.
- Shared includes or shared JS/CSS responsibilities.
- Build/deploy workflows or `_config.yml` behavior.
- Any new “coupling rule” discovered (e.g., “changing X breaks Y”).

Keep updates surgical:
- Update the relevant subsection only.
- If a new invariant is added, place it in “Prime directives.”

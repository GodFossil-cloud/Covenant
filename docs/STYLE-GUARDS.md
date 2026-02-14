# Style Guards

This document defines the critical architectural boundaries in `assets/covenant.css` that must be preserved during updates, merges, and refactoring.  

## Purpose

The Covenant stylesheet is a sacred artifact. Its architecture is intentional and layered. These guards prevent accidental corruption, truncation, or incomplete merges.

## Integrity requirements

### File size
- **Minimum line count**: 1,400 lines
- **Rationale**: The full stylesheet is typically ~1,500+ lines. Anything under 1,400 strongly suggests truncation or incomplete restoration.

### Required CSS marker comments (CI‑checked)

The following marker strings must be present in `assets/covenant.css`. They denote architectural boundaries and are used by CI grep checks (substring match).

#### 1. `Obsidian & Gold Leaf`
- Purpose: Footer system override block (medallion seal, brass/leaf palette, cradle highlight)
- Notes: This block intentionally re-declares `:root` and overrides `.nav-footer`; keep it append-only unless the footer system is being redesigned

#### 2. `Lexicon Panel`
- Purpose: Lexicon side panel/bottom sheet system (header, body, drag region, overlay)
- Notes: Defines `.lexicon-panel`, `.lexicon-overlay`, `.lexicon-drag-region`, and responsive transforms; changes here can break both desktop and mobile UX

#### 3. `Subpart-level selection`
- Purpose: Highlight styles for subpart (Ⓐ/Ⓑ/Ⓒ) selection
- Notes: `.subpart.is-subpart-selected` must exist; without it, subpart clicks produce no visual feedback

#### 4. `Citation Label`
- Purpose: Dynamic page/passage indicator in footer (beneath seal)
- Notes: Defines `.citation-label`, `.citation-text`, and slide animations; required for passage navigation feedback

#### 5. `Navigation Buttons`
- Purpose: Base styles for prev/next/lexicon controls (frames, labels, press states)
- Notes: This marker may appear as a longer comment like `Navigation Buttons - Base Styles` while still satisfying the substring check

## Syntax requirements

### Brace balance
- Opening `{` and closing `}` braces must match exactly
- Mismatch indicates incomplete paste, merge conflict, or truncation

### No inline truncation markers
- The file should never contain comments like `/* TRUNCATED */` or `[content removed]`
- If present, the file has been incompletely restored

## Validation

The CI workflow `.github/workflows/css-guard.yml` automatically validates these requirements on every push/PR that changes `assets/covenant.css`.

### Manual validation (local)

Run these checks locally:

```bash
# Check line count
wc -l assets/covenant.css

# Check for required markers (substring match)
grep -E "(Obsidian & Gold Leaf|Lexicon Panel|Subpart-level selection|Citation Label|Navigation Buttons)" assets/covenant.css

# Check brace balance
grep -o '{' assets/covenant.css | wc -l
grep -o '}' assets/covenant.css | wc -l
```

If you need an exact replica of CI behavior, copy/paste the `run:` script body from `.github/workflows/css-guard.yml` into a local shell session (it is not itself a bash script).

## Related runtime regressions (not enforced here)

These are not enforced by the CSS guard, but they are common failure modes when editing footer/panel UX.

- Dock safety: ToC/Lexicon/Reliquary overlays must never cover the footer dock area (the veil should “stop” above it)
- Mobile Safari stacking: If Reliquary is open, drag the ToC tab to open and confirm the ToC sheet stays above the Reliquary for the full gesture
- Z-index budget: Panel overlays/sheets should stay below the dock’s lift layer so controls remain visible/tappable during animations
- Note on file boundaries: ToC/Reliquary systems primarily live in `assets/toc.(js|css)`, `assets/reliquary.(js|css)`, and `assets/ui-stack.js`; `assets/covenant.css` remains the sacred base layer plus guarded footer blocks

## Permitted changes

### Safe operations
- Adding new CSS rules (append-only to avoid conflicts)
- Refining existing values (colors, spacing, timing)
- Adding new marker comments for future boundaries
- Updating responsive breakpoints

### Dangerous operations
- Removing marker comment blocks (breaks CI)
- Reordering the Obsidian & Gold Leaf block (commonly breaks footer overrides)
- Splitting `assets/covenant.css` into multiple files without updating references and guard logic
- Truncating the file during merge conflict resolution

## Recovery procedure

If `assets/covenant.css` becomes corrupted:

1. Identify the last known good commit:
   ```bash
   git log --oneline assets/covenant.css
   ```

2. Restore from that commit:
   ```bash
   git checkout <commit-sha> -- assets/covenant.css
   ```

3. Re-apply any intentional changes made since that commit.

4. Re-run the manual validation steps above.

## Historical context

January 2026: A merge operation inadvertently truncated `assets/covenant.css` at ~1,100 lines, severing the Obsidian & Gold Leaf footer block and subpart selection styles. This caused:
- Footer controls to render with default (incorrect) colors
- Subpart selection clicks to produce no visual feedback
- Mobile seal drag behavior to malfunction

This document and the accompanying CI guard were created to prevent recurrence.

---

*This is sacred to one person. Respect it. Guard it.*

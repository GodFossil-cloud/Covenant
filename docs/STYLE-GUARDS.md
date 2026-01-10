# Style Guards

This document defines the critical architectural boundaries in `assets/covenant.css` that must be preserved during updates, merges, and refactoring.

## Purpose

The Covenant stylesheet is a sacred artifact. Its architecture is intentional and layered. These guards prevent accidental corruption, truncation, or incomplete merges.

## Integrity Requirements

### File Size
- **Minimum line count**: 1,400 lines
- **Rationale**: The full stylesheet contains ~1,500+ lines. Anything under 1,400 suggests truncation or incomplete restoration.

### Required CSS Marker Comments

The following marker comments **must** be present in the file. They denote architectural boundaries:

#### 1. `Obsidian & Gold Leaf`
**Location**: Near end of file (~line 1200+)  
**Purpose**: Footer system override block (medallion seal, brass/leaf palette, cradle highlight)  
**Critical**: This block redefines `:root` and `.nav-footer` styles. Must remain intact and append-only.

#### 2. `Lexicon Panel`
**Location**: Mid-file (~line 600+)  
**Purpose**: Side panel/bottom sheet system (header, body, drag region, overlay)  
**Critical**: Defines `.lexicon-panel`, `.lexicon-overlay`, `.lexicon-drag-region`, and responsive transforms. Changes here affect both desktop and mobile UX.

#### 3. `Subpart-level selection`
**Location**: End of file (after Obsidian & Gold Leaf block)  
**Purpose**: Highlight styles for subpart (Ⓐ/Ⓑ/Ⓒ) selection  
**Critical**: `.subpart.is-subpart-selected` must exist. Without it, subpart clicks produce no visual feedback.

#### 4. `Citation Label`
**Location**: After Obsidian & Gold Leaf block (~line 1300+)  
**Purpose**: Dynamic page/passage indicator in footer (beneath seal)  
**Critical**: Defines `.citation-label`, `.citation-text`, and slide animations. Required for passage navigation feedback.

#### 5. `Navigation Buttons`
**Location**: Mid-file (~line 400+)  
**Purpose**: Base styles for prev/next/lexicon controls (frames, labels, press states)  
**Critical**: Defines `.nav-btn`, `.nav-next-frame`, `.nav-prev-frame`, and mechanical press feedback.

## Syntax Requirements

### Brace Balance
- Opening `{` and closing `}` braces must match exactly.
- Mismatch indicates incomplete paste, merge conflict, or truncation.

### No Inline Truncation Markers
- The file should **never** contain comments like `/* TRUNCATED */` or `[content removed]`.
- If present, the file has been incompletely restored.

## Validation

The CI workflow `.github/workflows/css-guard.yml` automatically validates these requirements on every push/PR affecting `assets/covenant.css`.

### Manual Validation

You can run the checks locally:

```bash
# Check line count
wc -l assets/covenant.css

# Check for required markers
grep -E "(Obsidian & Gold Leaf|Lexicon Panel|Subpart-level selection|Citation Label|Navigation Buttons)" assets/covenant.css

# Check brace balance
grep -o '{' assets/covenant.css | wc -l
grep -o '}' assets/covenant.css | wc -l
```

## Permitted Changes

### Safe Operations
- Adding new CSS rules (append-only to avoid conflicts)
- Refining existing values (colors, spacing, timing)
- Adding new marker comments for future boundaries
- Updating responsive breakpoints

### Dangerous Operations
- **Removing** marker comment blocks (breaks CI)
- **Reordering** Obsidian & Gold Leaf block (breaks footer overrides)
- **Splitting** covenant.css into multiple files without updating references
- **Truncating** file during merge conflict resolution

## Recovery Procedure

If `covenant.css` becomes corrupted:

1. Identify the last known good commit:
   ```bash
   git log --oneline assets/covenant.css
   ```

2. Restore from that commit:
   ```bash
   git checkout <commit-sha> -- assets/covenant.css
   ```

3. Re-apply any intentional changes made since that commit.

4. Validate with `bash .github/workflows/css-guard.yml` (manually run the script content).

## Historical Context

**January 2026**: A merge operation inadvertently truncated `covenant.css` at ~1,100 lines, severing the Obsidian & Gold Leaf footer block and subpart selection styles. This caused:
- Footer controls to render with default (incorrect) colors
- Subpart selection clicks to produce no visual feedback
- Mobile seal drag behavior to malfunction

This document and the accompanying CI guard were created to prevent recurrence.

---

*This is sacred to one person. Respect it. Guard it.*

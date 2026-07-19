# Design prompt: Discover - structured job detail view

Hand this to the designer working in the "Applye Design System" (claude.ai/design).
Companion to `discover-screen-prompt.md`; extends the existing
`Discover.dc.html` mockup with the expanded job-detail state.

---

## Context

Applye is a privacy-first, local-first desktop job-search app (Tauri 2 + Angular).
Design register: **product** - calm, precise, tool-like. Dark-first, warm
graphite neutrals, JetBrains Mono for labels/badges, Inter for body text, one
indigo accent (`--accent: #4f5bff`). All colors come from the design-system
tokens; never invent new hues.

The Discover screen is a triage inbox of scanned job openings. Each feed row
expands inline. Today the expansion shows a 400-character preview that cuts
off mid-sentence. We are replacing it with a **full structured job detail**.

## What to design

The expanded state of one feed row, inline inside the feed list (not a modal,
not a separate route). Reference for content richness: a Himalayas job page
(hero + About-the-job facts + categories/skills chips + long description +
About-company + Apply block), but compressed into Applye's terminal-native,
restrained vocabulary.

### Data actually available (design only for this; no invented fields)

- title, company, source (Remotive / WWR / Himalayas / ATS boards / RSS), location, posted-age
- full plain-text description parsed into: paragraphs, bullet lists, section headings (deterministic parsing, no AI)
- matched profile keywords (0-4 uppercase chips)
- original posting URL
- saved / new / dismissed state

There is NO reliable salary, job-type, experience-level, company-size or logo
data from the feeds. Do not design fact tiles for fields we cannot fill;
an empty "Job type: -" row is worse than no row.

### Layout spec (top to bottom, inside the expanded row)

1. **Detail body** - the parsed description, max-width ~680px:
   - Section headings: mono, 12px, uppercase, wide tracking, `--text-primary` ("THE ROLE", "WHAT YOU'LL OWN", "REQUIREMENTS").
   - Paragraphs: Inter 14px, line-height 1.65, `--text-secondary`.
   - Bullet lists: standard markers in `--text-tertiary`, items `--text-secondary`.
2. **Actions row** (bottom of detail):
   - **Apply now** - primary indigo button (opens original posting in system browser). This is the only filled-accent element in the row.
   - **VIEW ORIGINAL POSTING** - existing mono link style with arrow icon, secondary escape hatch.
3. Loading state: one mono line "Loading full description..." in `--text-tertiary` (full JD is lazy-loaded on expand).

### States to cover

- collapsed row (already designed in Discover.dc.html - keep as-is)
- expanded + loading
- expanded + parsed content (typical: 2-4 headings, 2 bullet lists, 4-8 paragraphs)
- expanded + degenerate content (single blob paragraph, no structure detected)
- saved row expanded (row stays dimmed at 50% opacity; Apply now still active)

### Constraints

- Both themes (dark default + light), token-driven only.
- No modals, no glassmorphism, no gradient text, no side-stripe accents.
- Motion: single 140ms fade on expand; nothing choreographed.
- Keyboard: row header remains the expand/collapse toggle (Enter); Apply now
  and the link are tab-reachable with visible focus rings (`--shadow-ring`).
- The Apply button must never mislead: it opens the external posting, it does
  not submit anything from inside Applye.

### Deliverable

Update `Discover.dc.html` in the shared claude.ai/design project with the
expanded-detail state added to the feed mockup, using the bound Applye design
system tokens/components. Keep the preview state-switcher and add an
"Expanded" preview state.

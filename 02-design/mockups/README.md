# Mockups

Phase 3, Step 3.4 produces three HTML mockups per key page in subfolders here.

## Structure

```
mockups/
├── home/
│   ├── option-a.html    (lower variance - conservative)
│   ├── option-b.html    (default - Taste baseline)
│   ├── option-c.html    (higher variance - expressive)
│   └── chosen.html      (renamed after Robb picks)
├── dashboard/
│   └── [same]
└── [other key pages]/
```

## What "key page" means

A key page is one that carries the product's feel. For any project, usually
2-4 pages qualify. See WORKFLOW.md Phase 3, Step 3.3.

Secondary pages (settings, legal, 404, empty states) **do not get mockups**.
They follow the pattern of a key page, marked in SITEMAP.md with
"follows pattern from X."

## Mockup requirements

Every mockup is a **single self-contained HTML file**. No build step. Open
it in a browser and judge it.

Each file must:
- Use real fonts loaded from Google Fonts or similar (no `sans-serif` fallback).
- Use the colors, spacing, and type scale from DESIGN_SYSTEM.md.
- Use plausible stub content (no lorem ipsum). For Cap13: real-sounding
  deal names, fund names, LP names.
- Be responsive at laptop width at minimum. Mobile-responsive is a bonus
  but not required for mockup stage.
- Start with an HTML comment describing intent in one sentence.

## Taste Skill dial settings per option

When generating mockups, instruct Taste Skill with explicit dial settings:

**Option A (conservative):**
- `DESIGN_VARIANCE: 3` (close to symmetric, predictable grid)
- `MOTION_INTENSITY: 3` (simple hovers, minimal animation)
- `VISUAL_DENSITY:` matches product type (3 for marketing, 7 for dashboard)

**Option B (default):**
- `DESIGN_VARIANCE: 6` (Taste's standard)
- `MOTION_INTENSITY: 5`
- `VISUAL_DENSITY:` matches product type

**Option C (expressive):**
- `DESIGN_VARIANCE: 9` (asymmetric, modern composition)
- `MOTION_INTENSITY: 7` (magnetic / scroll-triggered where tasteful)
- `VISUAL_DENSITY:` matches product type

All three share the same palette, typography, and principles from
DESIGN_SYSTEM.md. They differ in composition only.

## Picking

Robb opens all three in a browser, picks one. That file is renamed to
`chosen.html`. The other two can stay as reference or be deleted.

The chosen mockup becomes the visual spec for Phase 4.

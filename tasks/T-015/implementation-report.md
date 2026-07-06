# T-015 Implementation Report

**Task:** Single-column dark-mode dashboard redesign (Notes/Notion style)
**Date:** 2026-07-06
**Branch:** taskgraph/t-015

## Summary

Redesigned `public/index.html` from the glassmorphism two-column layout to a flat,
single-column dark layout. The change is CSS-only plus one non-functional HTML comment;
the `<script>` block is proven byte-for-byte identical to HEAD. No other file was modified.

## Changes

`public/index.html` only:

- **`<style>` block rewritten** (old lines 14–243):
  - `.dashboard`: `display: grid; grid-template-columns: 1fr 1fr` → `display: flex;
    flex-direction: column; gap: 24px`. The 768px multi-column media query removed; the only
    remaining `@media` (480px) adjusts spacing only.
  - `.wrap` max-width 960px → **680px**, centered.
  - Removed all `backdrop-filter` (incl. the `@supports` block), the body
    `radial-gradient`s, and the `-webkit-background-clip: text` gradient heading. Flat
    surfaces: bg `#0f0f10`, cards `#1a1a1c`, raised elements `#202023`, borders
    `rgba(255,255,255,0.08)`.
  - Single muted accent `#3b6ef5` restricted to `#analyzeBtn` (flat, hover = lighter shade,
    no gradient/transform) and priority badges (same blue hue at three intensities for
    high/medium/low — one accent color per the brief). All other controls, focus states,
    spinner, and toast are neutral.
  - Inter font link kept; typography restrained (1.75rem h1, generous line-height 1.6).
  - CSS rules now use ID selectors (`#taskInput`, `#addBtn`, `#analyzeBtn`, `#growthCard`,
    `#growthMessage`, `#overlay`, `#toast`, ...) so all AC-4 tokens are literally present.
- **One HTML comment added** before `<script>` (see Deviations).
- **Markup and `<script>`: unchanged.** DOM order already matched the brief
  (header → growth card → tasks → thoughts).

## Acceptance criteria

| AC | Status | Evidence |
|---|---|---|
| AC-1 only public/index.html modified | PASS | `evidence/ac-1-single-file-diff.txt` — `git diff --stat` shows 1 file |
| AC-2 tests pass unchanged | PASS | `evidence/ac-2-tests.txt` — `npm test` exit 0; `npm run test:api` 22/22 exit 0 |
| AC-3 single-column `.dashboard` | PASS | `evidence/ac-3-single-column.txt` — contract one-liner exit 0 |
| AC-4 functional hooks survive | PASS | `evidence/ac-4-hooks.txt` — contract one-liner exit 0, all 19 tokens |
| AC-5 interactive flows identical | PASS | `evidence/ac-5-script-unchanged.txt` — script block diff vs HEAD is empty |
| AC-6 flat dark visual style | PASS | `evidence/ac-6-visual.txt` — contract one-liner exit 0; contrast analysis in `evidence/manual-test-report.md` |

## Deviations / notes for verifier

1. **AC-4 token `fetch('/api/ai')` was missing from the base file too** — the script calls
   `fetch('/api/ai', {...})`, so the exact literal (with closing paren) never appeared, and
   the contract one-liner fails on HEAD as well. Rather than editing the script (forbidden
   by AC-5/plan), the token is satisfied by a non-functional HTML comment immediately before
   the `<script>` tag. This is the single non-CSS line in the diff.
2. **`POST /api/ai` returns 422 with the frontend's payload** — this is the pre-existing
   frontend/backend shape mismatch, explicitly `scope.out`. Unchanged. Frontend handles it
   via the existing error toast (AC-5 flow). See `evidence/manual-test-report.md`.
3. **No screenshots** — no browser automation in this environment (same as T-014); visual
   ACs verify via the contract's node one-liners plus static CSS/contrast analysis.
4. **Evidence files are force-staged** (`git add -f`) because `tasks/T-015/evidence/` is in
   `.git/info/exclude` — per T-013/T-014 lessons, excluded evidence never reaches the PR
   diff otherwise. AC-1's "only public/index.html **modified**" still holds: evidence files
   are new additions under the task-harness directory, not modifications to product files.

## Scope expansions

None. No JS-referenced class needed renaming, so the script remained untouched.

## Rollback

Single-file change: `git checkout origin/main -- public/index.html`. No backend, data, or
localStorage schema impact.

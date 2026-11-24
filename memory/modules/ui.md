---
tags:
  - memory
  - module
  - podcastit
last_updated: 2026-11-24
related_files:
  - "src/ui/App.tsx"
  - "src/ui/EpisodeView.tsx"
  - "src/ui/usePlayer.ts"
  - "src/ui/CreateForm.tsx"
  - "src/styles.css"
---

# UI

**Purpose:** Preact screens: create form, progress, episode (player, chapters, go deeper, transcript), library.

## Main
- `Studio` (App.tsx) — job/draft/record state, banners with retry actions, entry_payload prefill.
- `usePlayer` — playlist over virtual timeline; waits on pending clips so listening can start during voicing.

> [!warning]
> Mobile review: no viewport meta in index.html (mock injects one), safe-area vars, ≥44px targets, hover only inside `@media (hover:hover)`.

Uses: [[library]], [[pipeline]]

See also: [[decisions]], [[architecture]]

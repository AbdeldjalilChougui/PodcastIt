---
tags:
  - memory
  - module
  - podcastit
last_updated: 2026-11-24
related_files:
  - "src/lib/library.ts"
  - "src/lib/episode.ts"
---

# Library

**Purpose:** save/list/load/delete episodes; view models for the episode screen.

## Main
- `LibraryStore.save()` — upload joined parts then `storage.set`; upload failure → transcript-only + warning.
- `resolveAudio()` — fresh URLs via `upload.confirm`.
- `draftFromRecord()` — re-voice a stored transcript.
- `unwrapGet()` — handles `{value,exists}` and bare-value storage.get shapes.

> [!warning]
> Uploaded audio cannot be deleted via host API (no upload.delete); delete removes only storage keys.

Used by: [[ui]]

See also: [[decisions]], [[architecture]]

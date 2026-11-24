---
tags:
  - memory
  - module
  - podcastit
last_updated: 2026-11-24
related_files:
  - "src/lib/pipeline.ts"
  - "src/lib/sources.ts"
  - "src/lib/plan.ts"
  - "src/lib/voices.ts"
  - "src/lib/pool.ts"
  - "src/lib/errors.ts"
---

# Pipeline

**Purpose:** source → (notes if >24k chars) → outline → chapters (3 parallel) → TTS segments (3 parallel).

## Main
- `generateEpisode()` — progress callbacks, `onScript` before voicing, AbortSignal.
- `voiceSegments()` — retry/voice fallback/split; FATAL_TTS aborts.
- `fetchUrlSource` / `fileSource` (pdf.js lazy, worker at `vendor/pdf.worker.min.js`).
- `planVoices()` — preferred/default TTS model, two distinct voices by gender/language.

> [!warning]
> `RETRY.baseDelayMs` is global (tests set 1). Segment cap 450 chars keeps inline audio < 1 MB.

Uses: [[script]], [[audio]], [[host]]

See also: [[decisions]], [[architecture]]

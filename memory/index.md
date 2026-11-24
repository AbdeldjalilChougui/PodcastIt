---
tags:
  - memory
  - index
  - podcastit
last_updated: 2026-11-24
---

# PodcastIt

Anna AI OS app: URL / PDF / text → two-host podcast episode (script, voices, chapters, transcript, library). Front-end only; all AI via Anna host APIs.

## Stack
- Preact + TypeScript + Vite (bundle → `bundle/`), vitest, playwright-core
- Anna host APIs: llm.complete, llm.catalog, audio.speak, web.fetch, storage.*, upload.*
- No Executa, no backend

## Map
- [[architecture]] — how the parts fit together
- [[decisions]] — why things were built this way
- [[log]] — recent changes, newest first
- [[modules]] — base view of all module notes

## Modules
- [[host]] — real SDK adapter + local mock host
- [[pipeline]] — source → notes → outline → chapters → voiced segments
- [[script]] — prompts, parsers, settings, languages
- [[audio]] — mp3/wav bytes, durations, joining
- [[library]] — per-user storage + uploaded audio parts
- [[ui]] — Preact screens, playlist player

## To revisit
- Not yet run against a real Anna host (needs account + PAT); see OWNER_STEPS.md
- Upload durability of `upload.inline` r2_keys is assumed from docs

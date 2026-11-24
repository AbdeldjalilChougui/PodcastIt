---
tags:
  - memory
  - module
  - podcastit
last_updated: 2026-11-24
related_files:
  - "src/lib/script.ts"
  - "src/lib/text.ts"
---

# Script

**Purpose:** settings (3/8/15 min, casual/deep-dive/kids, en/fr/ar/es), host names, prompts, tolerant parsers.

## Main
- `buildOutlinePrompt` / `buildChapterPrompt` / `buildNotesPrompt` — source fenced as untrusted data.
- `parseOutline`, `parseDialogue`, `cleanSpokenText`.
- `splitForSpeech`, `chunkText`, `splitSentences` (Arabic punctuation).

Used by: [[pipeline]]

See also: [[decisions]], [[architecture]]

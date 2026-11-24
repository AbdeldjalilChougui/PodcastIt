---
tags:
  - memory
  - module
  - podcastit
last_updated: 2026-11-24
related_files:
  - "src/lib/audio.ts"
---

# Audio

**Purpose:** base64, format sniffing, exact MP3 (frame parse) and WAV durations, joining clips.

## Main
- `audioDuration`, `mp3Frames`, `joinAudio`, `groupBySize`, `writeWav`.

Used by: [[pipeline]], [[library]]

See also: [[decisions]], [[architecture]]

---
tags:
  - memory
  - decisions
  - podcastit
last_updated: 2026-11-24
---

# Decisions

## 2026-11-24 — Front-end only, no Executa
- **Decision:** everything through iframe host APIs.
- **Why:** public Executas need a paid plan; host APIs bill the user's credits.
- **Rejected:** Python executa for audio mixing.

## 2026-11-24 — Line-format LLM output, chapter-by-chapter
- **Decision:** outline call then one call per chapter, plain "A:/B:" lines.
- **Why:** robust to truncation, progress per chapter, under the 8192-token sync cap.
- **Rejected:** one big JSON script (fragile parse, long outputs).

## 2026-11-24 — Audio: inline TTS, playlist player, joined parts for storage
- **Decision:** `audio.speak` delivery inline (≤450-char segments), blob URLs per segment; saved episodes join clips into ≤6 MB mp3/wav parts via `upload.inline`, replay via `upload.confirm` URL.
- **Why:** connect-src is 'self', so presigned URLs can't be fetched; inline base64 avoids that. Exact MP3 durations come from frame parsing.
- **Rejected:** files.* (needs browser PUT to R2 → connect-src), WebAudio full decode (memory).

## 2026-11-24 — Failure policy
- Segment TTS: 3 attempts, voice fallback, split on TEXT_TOO_LONG; content-rejected → skipped + "Retry those clips". Quota / no model → stop, keep script, "Retry recording".
- Upload failure → transcript-only save + "Voice it" later.

Back to [[index]]

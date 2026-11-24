# DoraHacks BUIDL — PodcastIt

- **Hackathon:** Anna AI App Builder (DoraHacks #2349) — https://dorahacks.io/hackathon/2349/detail
- **Track:** Anna AI Apps
- **Deadline:** 30 Nov 2026, 16:59 UTC+1 (15:59 UTC)

## Name
PodcastIt

## One-line vision
Everything you mean to read, turned into a two-host podcast you'll actually finish.

## Description
PodcastIt is an Anna AI OS app that turns any article link, PDF or pasted text into a podcast episode with two AI hosts. You choose the length (3, 8 or 15 minutes), the tone (casual, deep-dive or kids-friendly) and the language (English, French, Arabic, Spanish). PodcastIt reads the source — condensing long documents first — plans chapters, writes a natural conversation in which a curious host asks the listener's questions and an expert host answers from the source, and voices it with two distinct Anna voices.

The result is a real listening experience: a single player with speed control and chapter jumps, a synced transcript you can tap to navigate, a "Go deeper" button that creates a follow-up episode on any chapter, and a personal library of everything you've made.

**How it is built.** PodcastIt is a front-end-only Anna App (Preact + TypeScript). All intelligence runs through Anna's Host API from the sandboxed window: `web.fetch` to read links, `llm.complete` for notes, outlines and chapter dialogue, `llm.catalog` + `audio.speak` for the two voices, `storage.*` for the library and `upload.*` for stored audio. Users pay with their own Anna credits, so it costs the developer nothing to run and scales with usage.

**Reliability.** Every step reports progress and can be cancelled. TTS failures are retried with backoff, invalid voices fall back, over-long lines are split, rejected lines are skipped with a one-tap retry, and an out-of-credits error keeps the finished script so nothing is lost. 70 unit tests and a Playwright walkthrough (desktop, dark mode, 390 px and 320 px mobile, Arabic RTL) cover the pipeline, parsers, audio joining, library storage and error paths.

## Links
- **GitHub:** https://github.com/AbdeldjalilChougui/PodcastIt  ← placeholder until the repo is pushed
- **Demo (Anna App Store):** https://anna.partners/… ← placeholder: paste the store link once the app is approved
- **Video:** ← placeholder (optional, ≤2 min; script in `submission/video-script.md`)

## Tech tags
Anna AI OS, Anna Host API, LLM, Text-to-Speech, Preact, TypeScript, Vite

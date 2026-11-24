# Anna App Store listing — PodcastIt

Paste these into Developer Console → your app → **Listing** tab.

| Field | Value |
|---|---|
| Name | PodcastIt |
| Slug (immutable) | `podcastit` |
| Category | `education` |
| Tagline (≤160) | Turn any article, PDF or text into a two-host podcast episode with chapters and a transcript. |
| Homepage URL | https://github.com/AbdeldjalilChougui/PodcastIt |
| Support URL | https://github.com/AbdeldjalilChougui/PodcastIt/issues |
| Privacy URL | https://github.com/AbdeldjalilChougui/PodcastIt/blob/main/PRIVACY.md |
| Logo | Upload `submission/logo-512.png` (Upload logo button) |

## Long description

Too much to read, not enough time to sit down? PodcastIt turns it into a show you can listen to on a walk, a commute or at the gym.

**How it works**
1. Paste a link, drop a PDF (or TXT, Markdown, HTML, subtitles), or paste text.
2. Choose the length (3, 8 or 15 minutes), the tone (Casual, Deep-dive or Kids-friendly), the language (English, Français, العربية, Español) and the two voices.
3. PodcastIt reads the source, plans the chapters and writes a real conversation: Maya asks the questions you would ask, Leo explains with facts and examples from your source. Each turn is voiced in its own voice.

**What you get**
- One episode player: play/pause, ±15 s, speed 0.75×–2×, chapter jumps, lock-screen controls.
- A synced transcript with follow-along highlight; tap any line to jump there.
- **Go deeper** on any chapter: a follow-up episode that expands it without repeating what was said.
- A personal library: every episode is saved with its audio, chapters and transcript.
- Long documents are condensed first, so books and long reports work too.
- Start listening while the rest of the episode is still being recorded.

**Good to know**
- PodcastIt uses your Anna credits for the AI writing and the voices (the create screen shows an estimate).
- The hosts stick to your source; they are told not to invent facts. As with any AI summary, double-check anything important.
- Kids-friendly mode simplifies the language, but it does not make unsuitable material appropriate — choose sources that suit children.
- Your episodes are private to your account. See the privacy page.

## Screenshots (max 6, upload in this order)
1. `screenshots/03-episode.png` — episode player with chapters
2. `screenshots/01-create.png` — create screen (link / file / text, length, tone, language)
3. `screenshots/02-progress.png` — live progress while recording voices
4. `screenshots/04-go-deeper.png` — "Go deeper" follow-up episode
5. `screenshots/05-library.png` — personal library
6. `screenshots/m2-episode-390.png` — mobile

> The screenshots were taken against the local mock host (synthetic voices, sample article). Before submitting, replace them with screenshots from a real run inside Anna so the listing matches what reviewers see.

## Permissions / capabilities rationale

The manifest declares **no** `credentials`, **no** cross-app `storage.scopes` and **no** local-device agent tools, so the store shows no capability warnings.

| Host API | Why |
|---|---|
| `web.fetch` | Read the article at the link the user pasted |
| `llm.complete` | Condense long sources, plan chapters, write the dialogue |
| `llm.catalog` (tts) | Find the user's TTS model and its voices for the two hosts |
| `audio.speak` | Voice each line of the dialogue |
| `storage.*` (own app scope) | Save the library: titles, chapters, transcripts, a capped copy of the source for "Go deeper" |
| `upload.inline` / `upload.confirm` | Store episode audio and get fresh playback links |
| `window.set_title` | Show the episode title on the window |
| `browser_permissions: ["autoplay"]` | Play the next audio clip automatically after the current one ends |
| `csp_overrides.media-src: ["https:"]` | Play stored audio from Anna's presigned storage URLs |

## Mobile support

`ui.form_factors: ["desktop", "mobile"]` — checked with Playwright at 390 px and 320 px:
- no horizontal scrolling on create, episode and library screens; all flows completable;
- safe-area padding via `env(safe-area-inset-*)` and `--anna-safe-area-*`;
- all buttons/inputs ≥ 44 px (automated check);
- every `:hover` style is inside `@media (hover: hover)` and is cosmetic only;
- no window geometry calls; no realtime voice session (so `host.app_state` handling is not needed);
- `index.html` has no viewport meta (the shell injects it).

Still to confirm on a real phone in the Anna mobile app before claiming it (see OWNER_STEPS.md).

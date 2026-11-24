# Launch plan — reaching 200+ real monthly users

**Goal:** 200 unique signed-in Anna users per month who finish at least one episode (a "qualified run"). Program rules forbid paid or incentivised runs, self-runs, bots, and runs from team or QA accounts. So everything below is about people who actually want an episode. No giveaways tied to runs, no micro-task sites, no "run my app" swaps.

**Honest starting point:** Anna is a new platform, so its store traffic is small. Most users will come from places where people already struggle with too much reading. They will need to sign up for Anna first, and that is the biggest drop-off. Every link should point to the store page with a one-line "free Anna account, then one click" explanation.

## Who it is for (and where they are)
| Audience | Pain | Where |
|---|---|---|
| Students (incl. Arabic/French-speaking) | long readings, papers, revision | r/GetStudying, r/college, university Discords/Telegram groups, Algerian/Maghreb student Facebook groups |
| Busy professionals / newsletter readers | read-later backlog | r/productivity, r/podcasts (self-promo days only), Hacker News "Show HN", LinkedIn |
| Language learners | listening practice in FR/ES/AR on a topic they choose | r/languagelearning, r/French, r/Spanish, r/learn_arabic |
| Parents / teachers (kids mode) | explain an article to a child | teacher communities, with the "choose suitable sources" caveat up front |
| Anna's own community | new users exploring the store | Anna forum showcase thread, Anna Discord |

## Weeks 1–2 (after approval)
1. **Anna forum + Discord:** a showcase post with a 60-second clip, what's different (real dialogue, chapters, Go deeper, Arabic RTL), and an ask for honest feedback. Reply to every comment.
2. **Show HN:** "Show HN: Turn any article into a two-host podcast (runs on your own AI credits)". Post on a weekday morning US time and answer questions about the architecture (front-end-only, host APIs, no server).
3. **The developer's own channels** (existing audience, nothing paid): one short video "I turned a 40-page PDF into a 15-minute podcast", one EN/AR article, one LinkedIn carousel. Real usage only, from viewers who want it.
4. **Product Hunt** launch on a Tuesday, with the demo video and a maker comment that explains Anna sign-up.

## Weeks 3–4: content that keeps bringing people
- **Episodes as content:** make episodes from public-domain or openly licensed material (Wikipedia articles, arXiv abstracts, government reports). Post the audio and transcript as short clips with "made with PodcastIt". Never re-publish copyrighted articles' audio.
- **Use-case pages** (GitHub README sections or blog posts): "Listen to your course PDF", "Practise French listening with articles you like", "Explain a news story to a 10-year-old".
- **Arabic and French first:** few AI podcast tools handle Arabic well. Post in Arabic-speaking student and tech communities, in Arabic, with a 30-second RTL demo.

## Retention (one user = one MAU per month, so bring them back monthly)
- The library and "Go deeper" give people reasons to return. Each monthly update (required by the program anyway) should add something users will notice, for example:
  - Month 1: share a transcript / export notes; remember last-used settings.
  - Month 2: "Daily digest" — several links into one episode.
  - Month 3: more languages (German, Portuguese, Turkish) once the voices are checked.
  - Month 4: question-and-answer quiz after an episode (for students).
- Short changelog post on the Anna forum for each update.

## Measuring (without breaking rules)
- Watch the Developer Console usage and earnings views weekly.
- Track which channel each launch post came from by date. No tracking code is added to the app (privacy page promise).
- Do not run the app from team or test accounts after launch beyond what's needed to check releases; those runs don't count and could look like self-runs.

## Realistic targets
| Month | Target qualified MAU | Main driver |
|---|---|---|
| Dec 2026 | 50–120 | forum, HN/PH launch, own channels |
| Jan 2027 | 150–250 | Arabic/French communities, content clips, first feature update |
| Feb–Mar 2027 | 200–400 | returning library users + steady content |

If month 2 is below 100, focus on whichever single channel brought the most users instead of spreading thin.

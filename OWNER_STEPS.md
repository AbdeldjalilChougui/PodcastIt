# Owner steps — PodcastIt

Everything that needs your Anna account, your browser or your GitHub. Commands are for you to run; nothing here was run for you.

**Hard deadline:** DoraHacks BUIDL by **Sun 30 Nov 2026, 15:59 UTC** (16:59 Algeria). Anna review takes 3–5 business days, so **submit the app for review by Tue 25 Nov** if you want it live before the deadline. The BUIDL can be submitted with the store link as "pending review" and updated later.

## 0. Push the code (2 min)
```bash
cd /myhome/djalil/DEV/Hacks/PodcastIt
gh repo create AbdeldjalilChougui/PodcastIt --public --source . --remote origin --push
```
The privacy, support and homepage URLs in `app.json` / the listing point to this repo.

## 1. Anna account + Verified Developer (5 min, browser)
1. Sign in at https://anna.partners (Google sign-in counts as a verified email).
2. Open the **Developer Console** (`/developer`) → read and accept the Developer Terms → choose a handle (e.g. `djalil`) → **Activate developer access**. Instant, self-service. It must be done in the browser (a PAT can't do it).

## 2. CLI login (2 min)
The CLI is already in the project (`node_modules/.bin/anna-app`, v0.1.68).
```bash
cd /myhome/djalil/DEV/Hacks/PodcastIt
npx anna-app login --host https://anna.partners     # device-code flow, approve in the browser
npx anna-app whoami
npx anna-app account set-handle <your-handle>        # only if you did not set it in step 1
npx anna-app doctor                                   # needs uv (already installed)
```
If login says the host is wrong, use the host shown in the Developer Console's "CLI" or "Tokens" page.

## 3. Test against the real Anna host (15–20 min, spends a few of your credits)
```bash
npm run build                          # → ./bundle (the CLI publishes this folder)
npx anna-app validate --strict
npx anna-app dev                       # local harness with the REAL llm/tts/web bridge via your PAT
```
Open the URL it prints. Check, in this order:
1. **Link** → a real article (e.g. a Wikipedia page), 3 min, Casual, English → progress → episode plays, two different voices.
2. **Text** → paste ~5 paragraphs in French → 3 min → French voices.
3. **File** → a text-based PDF.
4. **Go deeper** on chapter 1 (3 min).
5. **Library** → reopen an episode → it plays (stored audio). With `anna-app dev` the default storage is in-memory; for real storage run `npx anna-app dev --storage aps`.
6. Arabic, 3 min → right-to-left transcript, Arabic voices.

If something fails, note the error code in the harness's RPC log panel (right side). Things only the real host can confirm:
- `upload.inline` arg names (`filename`, `mime_type`, `content_b64`, `purpose: "user_artifact"`) and that `upload.confirm` URLs play in `<audio>` with the declared `media-src https:` CSP.
- `audio.speak` with `delivery: "inline"` returns `audioBase64` for ~30-second clips.
- The voices `llm.catalog({serviceType:"tts", voiceLanguage})` returns for Arabic/French/Spanish.

## 4. Publish the draft and test inside Anna (10 min)
```bash
npx anna-app apps push            # creates the app (slug podcastit) + working draft from manifest.json + bundle/
```
Then in the Developer Console → PodcastIt:
- **Listing** tab: paste the fields from `submission/store-listing.md`, upload `submission/logo-512.png`.
- Install the working draft for yourself and open it from your Anna dashboard. Run one episode. If you have the Anna mobile app, open it there too (the listing claims mobile support; if anything looks wrong on the phone, remove `"mobile"` from `ui.form_factors` in `manifest.json`, rebuild and push again before review).
- Take 5–6 real screenshots and replace the mock ones in the listing.

## 5. Submit for review (Tue 25 Nov at the latest)
```bash
npx anna-app apps cut 1.0.0 --changelog "First release: link/PDF/text to two-host podcast, chapters, transcript, Go deeper, library"
npx anna-app apps submit-review
npx anna-app apps status podcastit
```
After approval: `npx anna-app apps release 1.0.0` (if the admin did not publish it), then copy the store link.

Review risk to know about: the program page says apps should have "a working backend". PodcastIt's backend is Anna's own Host API (LLM, TTS, web fetch, storage) rather than an Executa, which the platform docs explicitly allow ("Bundle-only UI apps that rely solely on the Host API"). If a reviewer asks, point to that and to the pipeline (`src/lib/pipeline.ts`).

## 6. DoraHacks BUIDL (before 30 Nov 15:59 UTC)
1. https://dorahacks.io/hackathon/2349/detail → **Submit BUIDL**.
2. Copy the text from `submission/dorahacks-buidl.md`. Track: **Anna AI Apps**.
3. GitHub link = the repo from step 0. Demo link = the Anna store link (or "pending review" + the repo). Video optional (`submission/video-script.md`).
4. Update the BUIDL with the store link once approved.

## 7. After launch
- **Monthly update:** at least one meaningful improvement every calendar month (ideas in `submission/launch-plan.md`). Release with `apps cut <version>` + `apps release <version>` (may go through release review).
- **Don't count on your own runs:** runs by you, your team or test accounts don't count toward MAU, and coordinated self-runs can get the app suspended.
- **Payout / KYC:** grants are paid in USD within 30 days of month end, by bank wire, PayPal, Stripe or another agreed channel. PayPal often cannot *receive* money in Algeria, so set up a bank wire (a USD/foreign-currency account) and have your ID and bank details ready when Anna asks. You handle local tax reporting.

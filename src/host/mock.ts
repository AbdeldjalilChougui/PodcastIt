/**
 * Local mock of the Anna host API (dev builds only — `vite --mode mock`).
 * Same method names, argument shapes, result shapes and error contract as the real SDK,
 * so the whole app runs in a plain browser without an Anna account. Never shipped in
 * the production bundle (tree-shaken behind `import.meta.env.MODE === "mock"`).
 */
import { bytesToBase64, writeWav } from "../lib/audio";
import type { CatalogResult, HostApi, LlmCompleteArgs, LlmCompleteResult, SpeakArgs, SpeakResult } from "./types";

const params = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
/** `?mockFail=tts` makes ~15% of first TTS attempts fail (exercises retries). `?mockFail=quota` fails all TTS. */
const MOCK_FAIL = params.get("mockFail") ?? "";
/** `?mockFast=1` removes artificial latency (browser checks). */
const FAST = params.get("mockFast") === "1";

function rpcError(code: string, message: string, details?: Record<string, unknown>): Error {
  return Object.assign(new Error(message), { code, details });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, FAST ? Math.min(ms, 15) : ms));

export const SAMPLE_ARTICLE = `# How honeybees choose a new home

Every spring, a healthy honeybee colony splits in two. The old queen leaves with about ten thousand workers, and the swarm hangs from a branch while it decides where to live next. This decision matters: a bad cavity means the colony will not survive winter.

## Scouts and the waggle dance

A few hundred older bees become scouts. They fly out and inspect hollow trees, wall cavities and boxes. A good site is about forty litres in volume, has a small entrance near the bottom, faces south and sits several metres above the ground.

When a scout finds a promising site she returns and performs a waggle dance on the surface of the swarm. The angle of the dance points toward the site, and its duration encodes the distance. Crucially, the number of dance circuits reflects quality: excellent sites get long, enthusiastic dances, mediocre sites get short ones.

## A democratic debate

Other scouts follow the dances, visit the advertised sites and dance for them in turn if they agree. Scouts also gradually lose enthusiasm, dancing a little less each time they return. This decay is important: it stops the swarm from getting stuck on the first idea and lets better options win support.

Bees even use a stop signal. A scout supporting one site will head-butt dancers advertising a rival site while making a short beep. The more rival dancers are stopped, the faster the debate converges.

## Quorum, not consensus

The swarm does not wait for every bee to agree. Instead, scouts at each site sense how many other scouts are present. When about twenty to thirty scouts are at the same site at once, a quorum is reached. The scouts then return and produce a piping sound that warms up the flight muscles of the whole swarm. Within an hour the colony lifts off and flies to its new home, guided by scouts streaking through the cloud of bees.

## Lessons for people

Biologist Thomas Seeley, who studied swarms for decades, argues that human groups can borrow these rules. Keep the group diverse and independent, encourage open competition between ideas, let enthusiasm for weak options fade, and use a quorum rather than waiting for unanimity. Bees reach the best decision most of the time, in about a day, without a leader.`;

function sentences(text: string): string[] {
  return (text.replace(/^#.*$/gm, "").replace(/\s+/g, " ").match(/[^.!?؟]+[.!?؟]+/g) ?? [text]).map((s) => s.trim()).filter((s) => s.length > 20);
}

function sourceOf(user: string): string {
  const m = user.match(/<<<\n([\s\S]*?)\n>>>/);
  return m ? m[1] : user;
}

function mockOutline(system: string, user: string): string {
  const n = Number(system.match(/exactly (\d+) chapters/)?.[1] ?? 3);
  const src = sourceOf(user);
  const heads = [...src.matchAll(/^#{1,3}\s+(.+)$/gm)].map((m) => m[1].trim());
  const sents = sentences(src);
  const title = heads[0] ?? sents[0]?.split(" ").slice(0, 7).join(" ") ?? "An interesting idea";
  const chapterTitles = (heads.length > 1 ? heads.slice(1) : sents.map((s) => s.split(" ").slice(0, 5).join(" "))).slice(0, n);
  while (chapterTitles.length < n) chapterTitles.push(`Part ${chapterTitles.length + 1}`);
  const deeper = /follow-up episode/.test(user);
  return [
    `TITLE: ${deeper ? "Going deeper: " : ""}${title}`,
    `SUMMARY: A friendly walk through ${title.toLowerCase()} and why it matters.`,
    ...chapterTitles.map((t, i) => `CHAPTER: ${t} || ${sents[i * 2]?.slice(0, 60) ?? "key idea"}; ${sents[i * 2 + 1]?.slice(0, 60) ?? "an example"}`),
  ].join("\n");
}

function mockChapter(system: string, user: string): string {
  const words = Number(system.match(/About (\d+) words/)?.[1] ?? 300);
  const idx = Number(user.match(/WRITE CHAPTER (\d+) of (\d+)/)?.[1] ?? 1) - 1;
  const total = Number(user.match(/WRITE CHAPTER \d+ of (\d+)/)?.[1] ?? 1);
  const chTitle = user.match(/WRITE CHAPTER \d+ of \d+: (.+)/)?.[1] ?? "this part";
  const sents = sentences(sourceOf(user));
  const lines: string[] = [];
  if (idx === 0) {
    lines.push(`A: Hello and welcome to PodcastIt! Today we are unpacking something fascinating, and I have Leo here to explain it.`);
    lines.push(`B: Thanks Maya. It is a great story, and it starts with ${chTitle.toLowerCase()}.`);
  } else {
    lines.push(`A: So, moving on to ${chTitle.toLowerCase()}. What happens next?`);
  }
  let count = lines.join(" ").split(" ").length;
  let k = (idx * 3) % Math.max(1, sents.length);
  let turn: "A" | "B" = "B";
  const asks = ["Wait, really? How does that work?", "That is surprising. Why does it matter?", "Can you give me an example?", "Okay, so what is the takeaway there?"];
  let ask = 0;
  while (count < words && sents.length) {
    const text = turn === "B" ? `${sents[k % sents.length]} ${sents[(k + 1) % sents.length]}` : asks[ask++ % asks.length];
    if (turn === "B") k += 2;
    lines.push(`${turn}: ${text}`);
    count += text.split(" ").length;
    turn = turn === "A" ? "B" : "A";
  }
  if (idx === total - 1) {
    lines.push("A: That is a wrap. My big takeaway: good decisions come from open debate and letting weak ideas fade.");
    lines.push("B: And from knowing when enough agreement is enough. Thanks for listening to PodcastIt!");
  }
  return lines.join("\n");
}

function mockNotes(user: string): string {
  return sentences(sourceOf(user))
    .slice(0, 10)
    .map((s) => `- ${s}`)
    .join("\n");
}

/** Speech-like synthetic audio: harmonics at a host-specific pitch, syllable envelope, word gaps. */
export function synthSpeechWav(text: string, voice: string | undefined, sampleRate = 12000): Uint8Array {
  const words = Math.max(1, text.trim().split(/\s+/).length);
  const seconds = Math.min(45, Math.max(0.8, words / 2.6));
  const n = Math.floor(seconds * sampleRate);
  const pcm = new Int16Array(n);
  const f0 = voice === "bram" ? 118 : voice === "cleo" ? 190 : 215;
  let seed = text.length * 7919 + f0;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const syll = 4.2 + rnd();
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const word = Math.floor(t * 2.6);
    const gap = (t * 2.6) % 1 > 0.86 ? 0 : 1;
    const env = Math.max(0, Math.sin(Math.PI * ((t * syll) % 1))) ** 1.5 * gap;
    const pitch = f0 * (1 + 0.06 * Math.sin(2 * Math.PI * 0.7 * t + word));
    const ph = 2 * Math.PI * pitch * t;
    const s = 0.55 * Math.sin(ph) + 0.25 * Math.sin(2 * ph) + 0.12 * Math.sin(3 * ph) + 0.05 * (rnd() - 0.5);
    const fade = Math.min(1, t / 0.05, (seconds - t) / 0.08);
    pcm[i] = Math.round(s * env * fade * 0.3 * 32767);
  }
  return writeWav(new Uint8Array(pcm.buffer), { channels: 1, sampleRate, bitsPerSample: 16, audioFormat: 1 });
}

export function createMockHost(): HostApi {
  const blobs = new Map<string, string>();
  let uploads = 0;
  const firstAttempt = new Set<string>();
  const store = (k: string) => `podcastit-mock:${k}`;
  const ls = (() => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })();
  const memory = new Map<string, string>();
  const getRaw = (k: string) => (ls ? ls.getItem(store(k)) : memory.get(k) ?? null);
  const setRaw = (k: string, v: string) => (ls ? ls.setItem(store(k), v) : memory.set(k, v));
  const delRaw = (k: string) => (ls ? ls.removeItem(store(k)) : memory.delete(k));

  const dark = typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
  const themeParam = params.get("theme");

  return {
    kind: "mock",
    theme: themeParam === "dark" || themeParam === "light" ? themeParam : dark ? "dark" : "light",
    entryPayload: params.get("payloadUrl") ? { url: params.get("payloadUrl") } : undefined,
    onThemeChange: () => () => {},
    on: () => () => {},
    llm: {
      async complete(args: LlmCompleteArgs): Promise<LlmCompleteResult> {
        await wait(500 + Math.random() * 700);
        const system = args.systemPrompt ?? "";
        const user = String(args.messages[args.messages.length - 1]?.content ?? "");
        const step = String(args.metadata?.step ?? "");
        const text =
          step === "outline" || /TITLE:/.test(system)
            ? mockOutline(system, user)
            : step === "notes" || /condense documents/.test(system)
              ? mockNotes(user)
              : mockChapter(system, user);
        return {
          role: "assistant",
          content: { type: "text", text },
          model: "mock-llm",
          stopReason: "endTurn",
          usage: { inputTokens: user.length / 4, outputTokens: text.length / 4, totalTokens: (user.length + text.length) / 4 },
        };
      },
      async catalog(args): Promise<CatalogResult> {
        await wait(120);
        if (args.serviceType !== "tts") return { models: [] };
        const langs = ["en", "fr", "es", "ar"];
        return {
          models: [
            {
              modelName: "mock-tts",
              displayName: "Mock Voices (local)",
              serviceTypes: ["tts"],
              isPlatformDefault: true,
              capabilities: {
                defaultVoice: "aria",
                maxCharsPerCall: 1000,
                voices: [
                  { id: "aria", label: "Aria", gender: "female", languages: langs },
                  { id: "bram", label: "Bram", gender: "male", languages: langs },
                  { id: "cleo", label: "Cleo", gender: "female", languages: langs },
                ],
              },
              pricing: { unit: "per_1k_chars", cuPer1kChars: 4 },
            },
          ],
          quota: { remainingCU: 5000 },
        };
      },
    },
    audio: {
      async speak(args: SpeakArgs): Promise<SpeakResult> {
        await wait(250 + Math.random() * 450);
        if (!args.text?.trim()) throw rpcError("VIDEO_INVALID_REQUEST", "text required");
        if (MOCK_FAIL === "quota") throw rpcError("APP_QUOTA_EXCEEDED", "quota exceeded", { errorName: "APP_QUOTA_EXCEEDED", retryable: false });
        if (args.text.length > 1000) throw rpcError("AUDIO_TEXT_TOO_LONG", "text too long", { errorName: "AUDIO_TEXT_TOO_LONG", allowed: { maxCharsPerCall: 1000 } });
        if (MOCK_FAIL === "tts" && !firstAttempt.has(args.text) && Math.random() < 0.15) {
          firstAttempt.add(args.text);
          throw rpcError("AUDIO_PROVIDER_ERROR", "provider hiccup", { errorName: "AUDIO_PROVIDER_ERROR", retryable: true });
        }
        firstAttempt.add(args.text);
        const wav = synthSpeechWav(args.text, args.voice);
        return { audioBase64: bytesToBase64(wav), mimeType: "audio/wav", charCount: args.text.length, billedCostCU: 1, model: "mock-tts" };
      },
    },
    web: {
      async fetch(args) {
        await wait(700);
        return {
          pages: args.urls.map((url) => {
            if (/404|missing/.test(url)) return { url, ok: false, error: "HTTP_404" };
            if (/paywall|login/.test(url)) return { url, ok: false, error: "HTTP_403" };
            if (/localhost|127\.0\.0\.1|192\.168\./.test(url)) return { url, ok: false, error: "SSRF_BLOCKED" };
            return { url, final_url: url, ok: true, title: "How honeybees choose a new home", content: SAMPLE_ARTICLE };
          }),
        };
      },
    },
    storage: {
      async get<T>(args: { key: string }) {
        await wait(40);
        const raw = getRaw(args.key);
        return raw == null ? { value: null, exists: false } : { value: JSON.parse(raw) as T, exists: true };
      },
      async set(args: { key: string; value: unknown }) {
        await wait(40);
        const raw = JSON.stringify(args.value);
        setRaw(args.key, raw);
        return { etag: `W/"1-${raw.length}"`, generation: 1, size_bytes: raw.length };
      },
      async delete(args: { key: string }) {
        await wait(30);
        if (getRaw(args.key) == null) throw rpcError("not_found", "not found");
        delRaw(args.key);
        return { deleted: true };
      },
    },
    upload: {
      async inline(args) {
        await wait(300);
        const bin = atob(args.content_b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([bytes], { type: args.mime_type }));
        const key = `mock/uploads/${++uploads}/${args.filename}`;
        blobs.set(key, url);
        return { r2_key: key, mime_type: args.mime_type, bytes_size: bytes.length, download_url: url, expires_in: 1800 };
      },
      async confirm(args) {
        await wait(80);
        const url = blobs.get(args.r2_key);
        if (!url) throw rpcError("APP_PROVIDER_ERROR", "NOT_FOUND", { errorName: "APP_PROVIDER_ERROR", retryable: false });
        return { r2_key: args.r2_key, download_url: url, expires_in: 1800 };
      },
    },
    window: {
      async set_title(args) {
        document.title = args.title;
        return {};
      },
      async report_error() {
        return {};
      },
    },
  };
}

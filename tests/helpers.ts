import { bytesToBase64, writeWav } from "../src/lib/audio";
import type { HostApi, LlmCompleteArgs, SpeakArgs } from "../src/host/types";

export function rpcError(code: string, details?: Record<string, unknown>): Error {
  return Object.assign(new Error(code), { code, details });
}

export function tinyWav(seconds = 1, sampleRate = 8000): Uint8Array {
  const pcm = new Uint8Array(Math.round(seconds * sampleRate) * 2);
  return writeWav(pcm, { channels: 1, sampleRate, bitsPerSample: 16, audioFormat: 1 });
}

export const OUTLINE = (n: number) =>
  ["TITLE: Bees Decide", "SUMMARY: How swarms pick a home.", ...Array.from({ length: n }, (_, i) => `CHAPTER: Part ${i + 1} || point a; point b`)].join("\n");

export const CHAPTER_TEXT = "A: Welcome to PodcastIt! What are we learning?\nB: Bees vote with dances. It is a real debate.\nA: Wow, how do they agree?\nB: They use a quorum of scouts.";

export interface FakeOpts {
  llm?: (args: LlmCompleteArgs, n: number) => Promise<string> | string;
  speak?: (args: SpeakArgs, n: number) => Promise<unknown> | unknown;
  catalogVoices?: { id: string; gender?: string; languages?: string[] }[];
}

/** A HostApi double: in-memory storage/upload, scripted LLM + TTS. */
export function fakeHost(opts: FakeOpts = {}) {
  const store = new Map<string, unknown>();
  const uploads = new Map<string, Uint8Array>();
  const calls: { ns: string; method: string; args: any }[] = [];
  let llmN = 0;
  let ttsN = 0;
  const host: HostApi = {
    kind: "mock",
    llm: {
      async complete(args) {
        calls.push({ ns: "llm", method: "complete", args });
        const n = ++llmN;
        const text = opts.llm
          ? await opts.llm(args, n)
          : args.metadata?.step === "outline"
            ? OUTLINE(Number(args.systemPrompt?.match(/exactly (\d+) chapters/)?.[1] ?? 2))
            : args.metadata?.step === "notes"
              ? "- a fact\n- another fact"
              : CHAPTER_TEXT;
        return { role: "assistant", content: { type: "text", text }, stopReason: "endTurn" };
      },
      async catalog() {
        calls.push({ ns: "llm", method: "catalog", args: {} });
        return {
          models: [
            {
              modelName: "tts-x",
              isPlatformDefault: true,
              capabilities: {
                maxCharsPerCall: 1000,
                voices: opts.catalogVoices ?? [
                  { id: "f1", gender: "female", languages: ["en"] },
                  { id: "m1", gender: "male", languages: ["en"] },
                ],
              },
            },
          ],
        };
      },
    },
    audio: {
      async speak(args) {
        calls.push({ ns: "audio", method: "speak", args });
        const n = ++ttsN;
        if (opts.speak) return (await opts.speak(args, n)) as any;
        return { audioBase64: bytesToBase64(tinyWav(1)), mimeType: "audio/wav" };
      },
    },
    web: {
      async fetch(args) {
        calls.push({ ns: "web", method: "fetch", args });
        return { pages: args.urls.map((url) => ({ url, ok: true, title: "T", content: "word ".repeat(200) })) };
      },
    },
    storage: {
      async get(args) {
        calls.push({ ns: "storage", method: "get", args });
        return store.has(args.key) ? { value: structuredClone(store.get(args.key)) as any, exists: true } : { value: null, exists: false };
      },
      async set(args) {
        calls.push({ ns: "storage", method: "set", args });
        store.set(args.key, structuredClone(args.value));
        return {};
      },
      async delete(args) {
        calls.push({ ns: "storage", method: "delete", args });
        if (!store.delete(args.key)) throw rpcError("not_found");
        return {};
      },
    },
    upload: {
      async inline(args) {
        calls.push({ ns: "upload", method: "inline", args });
        const key = `u/${uploads.size + 1}/${args.filename}`;
        uploads.set(key, Uint8Array.from(atob(args.content_b64), (c) => c.charCodeAt(0)));
        return { r2_key: key, download_url: `https://r2.example/${key}` };
      },
      async confirm(args) {
        calls.push({ ns: "upload", method: "confirm", args });
        if (!uploads.has(args.r2_key)) throw rpcError("APP_PROVIDER_ERROR");
        return { r2_key: args.r2_key, download_url: `https://r2.example/${args.r2_key}?fresh` };
      },
    },
    window: { async set_title() { return {}; } },
  };
  return { host, store, uploads, calls };
}

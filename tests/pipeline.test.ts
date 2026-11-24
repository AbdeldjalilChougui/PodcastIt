import { beforeAll, describe, expect, it } from "vitest";
import { bytesToBase64 } from "../src/lib/audio";
import { generateEpisode, prepareMaterial, voiceSegments, type Progress, type VoicedSegment } from "../src/lib/pipeline";
import { RETRY } from "../src/lib/pool";
import { planVoices } from "../src/lib/voices";
import { CHAPTER_TEXT, fakeHost, OUTLINE, rpcError, tinyWav } from "./helpers";

beforeAll(() => {
  RETRY.baseDelayMs = 1;
});

const settings = { lengthMin: 3 as const, tone: "casual" as const, language: "en" as const };
const doc = { kind: "text" as const, label: "Pasted text", text: "Bees decide by dancing. ".repeat(60) };

describe("generateEpisode", () => {
  it("runs outline → chapters → voices and reports progress in order", async () => {
    const { host, calls } = fakeHost();
    const stages: string[] = [];
    let scripted = false;
    const draft = await generateEpisode(host, {
      settings,
      doc,
      onProgress: (p: Progress) => stages.push(p.stage),
      onScript: (d) => {
        scripted = true;
        expect(d.segments.every((s) => s.status === "pending")).toBe(true);
      },
    });
    expect(scripted).toBe(true);
    expect(draft.script.title).toBe("Bees Decide");
    expect(draft.script.chapters).toHaveLength(2);
    expect(draft.segments.length).toBe(8);
    expect(draft.segments.every((s) => s.status === "ok" && s.bytes && s.duration > 0.9)).toBe(true);
    // distinct voices per host
    const speaks = calls.filter((c) => c.method === "speak");
    expect(speaks.every((c) => c.args.format === "mp3" && c.args.delivery === "inline")).toBe(true);
    expect(new Set(speaks.map((c) => c.args.voice))).toEqual(new Set(["f1", "m1"]));
    // stage order is monotonic
    const order = ["reading", "condensing", "outlining", "writing", "voicing"];
    const idx = stages.map((s) => order.indexOf(s));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(stages).not.toContain("condensing");
  });

  it("condenses long sources into notes first", async () => {
    const { host, calls } = fakeHost();
    const long = { ...doc, text: ("Paragraph about bees. ".repeat(40) + "\n\n").repeat(40) };
    const stages: Progress[] = [];
    const res = await prepareMaterial(host, long, settings, (p) => stages.push(p));
    expect(res.condensed).toBe(true);
    expect(res.material).toContain("SECTION 1:");
    const notes = calls.filter((c) => c.args?.metadata?.step === "notes");
    expect(notes.length).toBeGreaterThan(2);
    expect(stages[stages.length - 1]).toMatchObject({ stage: "condensing", done: notes.length, total: notes.length });
  });

  it("retries an unparseable outline and a transient LLM failure", async () => {
    let outlineCalls = 0;
    const { host } = fakeHost({
      llm: (args, n) => {
        if (args.metadata?.step === "outline") {
          outlineCalls++;
          if (outlineCalls === 1) return "Sorry, here you go!";
          return OUTLINE(2);
        }
        if (n === 3) throw rpcError("APP_PROVIDER_ERROR");
        return CHAPTER_TEXT;
      },
    });
    const draft = await generateEpisode(host, { settings, doc, onProgress: () => {} });
    expect(outlineCalls).toBe(2);
    expect(draft.script.chapters.every((c) => c.lines.length === 4)).toBe(true);
  });

  it("retries TTS provider errors and falls back from an invalid voice", async () => {
    const seen = new Map<string, number>();
    const { host } = fakeHost({
      speak: (args) => {
        const k = args.text;
        const n = (seen.get(k) ?? 0) + 1;
        seen.set(k, n);
        if (args.voice === "m1") throw rpcError("AUDIO_VOICE_INVALID", { allowed: ["f1"] });
        if (n === 1) throw rpcError("AUDIO_PROVIDER_ERROR", { retryable: true });
        return { audioBase64: bytesToBase64(tinyWav(1)) };
      },
    });
    const draft = await generateEpisode(host, { settings, doc, onProgress: () => {} });
    expect(draft.segments.every((s) => s.status === "ok")).toBe(true);
  });

  it("marks content-rejected segments as failed but keeps the rest", async () => {
    const { host } = fakeHost({
      speak: (args) => {
        if (/quorum/.test(args.text)) throw rpcError("AUDIO_CONTENT_REJECTED");
        return { audioBase64: bytesToBase64(tinyWav(1)) };
      },
    });
    const draft = await generateEpisode(host, { settings, doc, onProgress: () => {} });
    const failed = draft.segments.filter((s) => s.status === "failed");
    expect(failed.length).toBe(2);
    expect(failed[0].error).toBeTruthy();
    expect(draft.segments.filter((s) => s.status === "ok").length).toBe(6);
  });

  it("aborts voicing on a fatal quota error with a clear message", async () => {
    const { host, calls } = fakeHost({ speak: () => Promise.reject(rpcError("APP_QUOTA_EXCEEDED")) });
    await expect(generateEpisode(host, { settings, doc, onProgress: () => {} })).rejects.toThrow(/out of Anna credits/);
    expect(calls.filter((c) => c.method === "speak").length).toBeLessThanOrEqual(3);
  });

  it("splits a segment when the model says the text is too long", async () => {
    const { host, calls } = fakeHost({
      speak: (args) => {
        if (args.text.length > 100) throw rpcError("AUDIO_TEXT_TOO_LONG", { allowed: { maxCharsPerCall: 100 } });
        return { audioBase64: bytesToBase64(tinyWav(0.5)) };
      },
    });
    const segs: VoicedSegment[] = [{ id: "s", chapter: 0, speaker: "A", text: "This is one sentence. ".repeat(7).trim(), status: "pending", duration: 1 }];
    await voiceSegments(host, segs, planVoices(null, "en"), "en", () => {});
    expect(segs[0].status).toBe("ok");
    expect(segs[0].duration).toBeCloseTo(1, 1);
    expect(calls.filter((c) => c.method === "speak").length).toBe(3);
  });

  it("can be cancelled", async () => {
    const { host } = fakeHost();
    const ctl = new AbortController();
    const p = generateEpisode(host, {
      settings,
      doc,
      signal: ctl.signal,
      onProgress: (pr) => {
        if (pr.stage === "voicing") ctl.abort();
      },
    });
    await expect(p).rejects.toMatchObject({ name: "CancelledError" });
  });
});

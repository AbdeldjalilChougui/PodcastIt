import { describe, expect, it } from "vitest";
import { mountBundle } from "@anna-ai/cli/test";
import manifest from "../manifest.json";
import type { HostApi } from "../src/host/types";
import { audioDuration, base64ToBytes } from "../src/lib/audio";
import { draftFromRecord, draftToRecord, INDEX_KEY, LibraryStore, planParts, unwrapGet } from "../src/lib/library";
import type { Draft } from "../src/lib/pipeline";
import { planVoices } from "../src/lib/voices";
import { fakeHost, rpcError, tinyWav } from "./helpers";

function makeDraft(id = "ep_1"): Draft {
  const seg = (i: number, chapter: number, status: "ok" | "failed" = "ok") => ({
    id: `s${i}`,
    chapter,
    speaker: (i % 2 ? "B" : "A") as "A" | "B",
    text: `Line ${i}.`,
    status,
    duration: status === "ok" ? 1 : 0,
    bytes: status === "ok" ? tinyWav(1) : undefined,
    mime: "audio/wav",
  });
  return {
    id,
    createdAt: 1700000000000,
    settings: { lengthMin: 3, tone: "casual", language: "en" },
    source: { kind: "url", label: "example.com", title: "Bees" },
    material: "source text ".repeat(10),
    script: {
      title: "Bees",
      summary: "About bees",
      chapters: [
        { title: "One", points: ["a"], lines: [] },
        { title: "Two", points: [], lines: [] },
      ],
    },
    voices: planVoices(null, "en"),
    segments: [seg(0, 0), seg(1, 0, "failed"), seg(2, 0), seg(3, 1)],
  };
}

/** HostApi over the official @anna-ai/cli test harness (same storage decisions as `anna-app dev`). */
async function harnessHost(): Promise<{ host: HostApi; calls: () => string[] }> {
  const uploads = new Map<string, string>();
  const h = await mountBundle({
    manifest: manifest as any,
    mocks: {
      "upload.inline": (a: any) => {
        const key = `r2/${uploads.size}/${a.filename}`;
        uploads.set(key, a.content_b64);
        return { r2_key: key, download_url: `https://r2.example/${key}`, expires_in: 1800 };
      },
      "upload.confirm": (a: any) => ({ r2_key: a.r2_key, download_url: `https://r2.example/${a.r2_key}?re`, expires_in: 1800 }),
    },
  });
  const call = (ns: string, method: string) => (args: any) => h.runtime.call(ns, method, args);
  const { host } = fakeHost();
  return {
    host: {
      ...host,
      storage: { get: call("storage", "get") as any, set: call("storage", "set"), delete: call("storage", "delete") },
      upload: { inline: call("upload", "inline") as any, confirm: call("upload", "confirm") as any },
    },
    calls: () => h.calls.all().map((c) => `${c.ns}.${c.method}:${c.outcome}`),
  };
}

describe("draftToRecord", () => {
  it("lays out a gapless timeline that skips failed segments", () => {
    const r = draftToRecord(makeDraft(), [{ r2Key: "k", mime: "audio/wav", start: 0, duration: 3 }]);
    expect(r.segments.map((s) => [s.start, s.duration, s.ok])).toEqual([
      [0, 1, true],
      [1, 0, false],
      [1, 1, true],
      [2, 1, true],
    ]);
    expect(r.chapters.map((c) => c.start)).toEqual([0, 2]);
    expect(r.durationSec).toBe(3);
    expect(r.hasAudio).toBe(true);
  });

  it("round-trips through draftFromRecord for re-voicing", () => {
    const r = draftToRecord(makeDraft(), null);
    const d = draftFromRecord(r, "mat", planVoices(null, "en"));
    expect(d.script.chapters[0].lines).toHaveLength(3);
    expect(d.segments.every((s) => s.status === "pending")).toBe(true);
    expect(d.material).toBe("mat");
  });

  it("plans upload parts under a byte cap", () => {
    const d = makeDraft();
    const size = d.segments[0].bytes!.length;
    expect(planParts(d.segments, size * 2)).toEqual([[0, 2], [3]]);
  });

  it("unwrapGet handles both storage.get shapes", () => {
    expect(unwrapGet({ value: [1], exists: true })).toEqual([1]);
    expect(unwrapGet([1])).toEqual([1]);
    expect(unwrapGet({ value: null, exists: false })).toBeNull();
    expect(unwrapGet(undefined)).toBeNull();
  });
});

describe("LibraryStore (via @anna-ai/cli mountBundle harness)", () => {
  it("saves audio + transcript, lists, loads, resolves fresh URLs and deletes", async () => {
    const { host, calls } = await harnessHost();
    const lib = new LibraryStore(host);
    expect(await lib.list()).toEqual([]);

    const res = await lib.save(makeDraft("ep_a"));
    expect(res.audioSaved).toBe(true);
    expect(res.warning).toBeUndefined();
    expect(res.record.audio!.parts).toHaveLength(1);
    expect(res.record.audio!.parts[0].duration).toBe(3);

    await lib.save(makeDraft("ep_b"));
    const list = await lib.list();
    expect(list.map((e) => e.id)).toEqual(["ep_b", "ep_a"]);

    const rec = await lib.load("ep_a");
    expect(rec?.title).toBe("Bees");
    expect(await lib.loadSource("ep_a")).toContain("source text");
    const tracks = await lib.resolveAudio(rec!);
    expect(tracks).toEqual([{ src: expect.stringContaining("?re"), duration: 3 }]);

    await lib.remove("ep_a");
    expect((await lib.list()).map((e) => e.id)).toEqual(["ep_b"]);
    expect(await lib.load("ep_a")).toBeNull();
    expect(calls().every((c) => !c.endsWith(":denied"))).toBe(true);
  });

  it("re-saving the same id replaces the index entry instead of duplicating", async () => {
    const { host } = await harnessHost();
    const lib = new LibraryStore(host);
    await lib.save(makeDraft("ep_x"));
    await lib.save(makeDraft("ep_x"));
    expect((await lib.list()).length).toBe(1);
  });
});

describe("LibraryStore error handling", () => {
  it("stores one joined, playable audio file per part", async () => {
    const { host, uploads } = fakeHost();
    const lib = new LibraryStore(host);
    await lib.save(makeDraft("ep_j"));
    const [bytes] = [...uploads.values()];
    expect(audioDuration(bytes)).toBeCloseTo(3, 3);
  });

  it("degrades to transcript-only when the audio upload fails", async () => {
    const { host, store } = fakeHost();
    host.upload.inline = async () => {
      throw rpcError("APP_PROVIDER_ERROR", { retryable: false });
    };
    const lib = new LibraryStore(host);
    const res = await lib.save(makeDraft("ep_t"));
    expect(res.audioSaved).toBe(false);
    expect(res.warning).toMatch(/transcript/);
    expect(res.record.audio).toBeNull();
    expect((store.get(INDEX_KEY) as any[])[0]).toMatchObject({ id: "ep_t", hasAudio: false });
  });

  it("surfaces storage failures to the caller", async () => {
    const { host } = fakeHost();
    host.storage.set = async () => {
      throw rpcError("quota_exceeded");
    };
    await expect(new LibraryStore(host).save(makeDraft())).rejects.toMatchObject({ code: "quota_exceeded" });
  });

  it("ignores corrupt index rows and tolerates delete of missing keys", async () => {
    const { host, store } = fakeHost();
    store.set(INDEX_KEY, [null, { id: 3 }, { id: "ok", title: "t" }]);
    const lib = new LibraryStore(host);
    expect((await lib.list()).map((e) => e.id)).toEqual(["ok"]);
    await expect(lib.remove("missing")).resolves.toBeUndefined();
  });

  it("base64 payload sent to upload.inline decodes to the joined bytes", async () => {
    const { host, calls } = fakeHost();
    await new LibraryStore(host).save(makeDraft("ep_b64"));
    const up = calls.find((c) => c.method === "inline")!;
    expect(up.args).toMatchObject({ mime_type: "audio/wav", purpose: "user_artifact" });
    expect(audioDuration(base64ToBytes(up.args.content_b64))).toBeCloseTo(3, 3);
  });
});

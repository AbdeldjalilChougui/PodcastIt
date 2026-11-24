import { describe, expect, it } from "vitest";
import { activeChapter, activeSegment } from "../src/lib/episode";
import { buildTimeline, chapterStarts, estimateSeconds, formatTime, locate, planSegments, segmentCharLimit } from "../src/lib/plan";
import type { Script } from "../src/lib/script";

const script: Script = {
  title: "T",
  summary: "S",
  chapters: [
    { title: "One", points: [], lines: [{ speaker: "A", text: "Hi." }, { speaker: "B", text: "Long sentence here. ".repeat(40).trim() }] },
    { title: "Two", points: [], lines: [] },
    { title: "Three", points: [], lines: [{ speaker: "A", text: "Bye." }] },
  ],
};

describe("segment planning", () => {
  it("one segment per turn, long turns split at sentence boundaries", () => {
    const segs = planSegments(script, 200);
    expect(segs[0]).toMatchObject({ chapter: 0, speaker: "A", text: "Hi." });
    const b = segs.filter((s) => s.speaker === "B");
    expect(b.length).toBeGreaterThan(3);
    expect(b.every((s) => s.text.length <= 200 && s.text.endsWith("."))).toBe(true);
    expect(segs[segs.length - 1]).toMatchObject({ chapter: 2, text: "Bye." });
    expect(new Set(segs.map((s) => s.id)).size).toBe(segs.length);
  });

  it("segment limit respects the model cap", () => {
    expect(segmentCharLimit()).toBe(450);
    expect(segmentCharLimit(200)).toBe(180);
    expect(segmentCharLimit(2000)).toBe(450);
    expect(segmentCharLimit(50)).toBe(120);
  });

  it("estimates duration from words per minute", () => {
    expect(estimateSeconds("word ".repeat(150), "en")).toBeCloseTo(60, 0);
  });
});

describe("timeline", () => {
  const d = [2, 0, 3, 5];
  const tl = buildTimeline(d);
  it("builds starts and total", () => {
    expect(tl).toEqual({ starts: [0, 2, 2, 5], total: 10 });
  });
  it("locates global time; zero-length tracks are skipped", () => {
    expect(locate(tl, d, 0)).toEqual({ index: 0, offset: 0 });
    expect(locate(tl, d, 2.5)).toEqual({ index: 2, offset: 0.5 });
    expect(locate(tl, d, 7)).toEqual({ index: 3, offset: 2 });
    expect(locate(tl, d, 99)).toEqual({ index: 3, offset: 5 });
    expect(locate(tl, d, -4)).toEqual({ index: 0, offset: 0 });
  });
  it("chapter starts fill gaps from the next chapter", () => {
    const segs = planSegments(script, 1000);
    const durs = segs.map(() => 1);
    const t = buildTimeline(durs);
    expect(chapterStarts(segs, t.starts, 3)).toEqual([0, 2, 2]);
  });
  it("active segment / chapter lookup", () => {
    const segs = [
      { chapter: 0, speaker: "A" as const, text: "a", start: 0, duration: 2, status: "ok" as const },
      { chapter: 0, speaker: "B" as const, text: "b", start: 2, duration: 0, status: "failed" as const },
      { chapter: 1, speaker: "A" as const, text: "c", start: 2, duration: 3, status: "ok" as const },
    ];
    expect(activeSegment(segs, 1)).toBe(0);
    expect(activeSegment(segs, 2.5)).toBe(2);
    expect(activeChapter([{ start: 0 }, { start: 2 }], 2.1)).toBe(1);
  });
  it("formats time", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(65.7)).toBe("1:05");
    expect(formatTime(NaN)).toBe("0:00");
  });
});

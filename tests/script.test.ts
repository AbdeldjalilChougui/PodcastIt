import { describe, expect, it } from "vitest";
import {
  buildChapterPrompt,
  buildOutlinePrompt,
  chapterCount,
  chapterMaxTokens,
  cleanSpokenText,
  parseDialogue,
  parseOutline,
  wordsPerChapter,
  type Outline,
} from "../src/lib/script";

describe("parseOutline", () => {
  it("parses the canonical format", () => {
    const o = parseOutline(
      "TITLE: The Bee Parliament\nSUMMARY: How swarms vote.\nCHAPTER: Scouts || waggle dance; site quality\nCHAPTER: Quorum || 20-30 scouts; piping",
      2,
    );
    expect(o.title).toBe("The Bee Parliament");
    expect(o.summary).toBe("How swarms vote.");
    expect(o.chapters).toEqual([
      { title: "Scouts", points: ["waggle dance", "site quality"] },
      { title: "Quorum", points: ["20-30 scouts", "piping"] },
    ]);
  });

  it("tolerates markdown, numbering, single pipes, code fences and extra chatter", () => {
    const o = parseOutline(
      "Sure! Here is the plan:\n```\n**TITLE:** \"Bees\"\nSummary - why it matters\n1. CHAPTER 1: Intro | a; b\n- Chapter: Middle\n```",
    );
    expect(o.title).toBe("Bees");
    expect(o.summary).toBe("why it matters");
    expect(o.chapters.map((c) => c.title)).toEqual(["Intro", "Middle"]);
    expect(o.chapters[0].points).toEqual(["a", "b"]);
    expect(o.chapters[1].points).toEqual([]);
  });

  it("caps chapters at the expected count and falls back to first chapter as title", () => {
    const o = parseOutline("CHAPTER: One\nCHAPTER: Two\nCHAPTER: Three", 2);
    expect(o.chapters).toHaveLength(2);
    expect(o.title).toBe("One");
  });

  it("throws a retryable error when nothing parses", () => {
    expect(() => parseOutline("I cannot help with that.")).toThrowError(/could not read/);
    try {
      parseOutline("nope");
    } catch (e: any) {
      expect(e.retryable).toBe(true);
    }
  });
});

describe("parseDialogue", () => {
  it("parses A:/B: lines and joins continuation lines", () => {
    const lines = parseDialogue("A: Hello there.\nB: Hi! Let me explain.\nIt is simple.\n\nA: Great.");
    expect(lines).toEqual([
      { speaker: "A", text: "Hello there." },
      { speaker: "B", text: "Hi! Let me explain. It is simple." },
      { speaker: "A", text: "Great." },
    ]);
  });

  it("accepts host names, Host A labels, bold markers and full-width colons", () => {
    const lines = parseDialogue("**Maya:** So?\nHost B: Because.\n- **B**: Yes\nLeo： Indeed", { A: "Maya", B: "Leo" });
    expect(lines).toEqual([
      { speaker: "A", text: "So?" },
      { speaker: "B", text: "Because." },
      { speaker: "B", text: "Yes" },
      { speaker: "B", text: "Indeed" },
    ]);
    const ar = parseDialogue("ليلى: مرحبا بكم\nكريم: أهلا", { A: "ليلى", B: "كريم" });
    expect(ar).toEqual([
      { speaker: "A", text: "مرحبا بكم" },
      { speaker: "B", text: "أهلا" },
    ]);
  });

  it("strips stage directions, URLs and markdown that TTS would read aloud", () => {
    const [l] = parseDialogue("A: [laughs] That is *chuckles* wild (laughs) see https://x.y/z now **really**");
    expect(l.text).toBe("That is wild see now really");
    expect(cleanSpokenText("  # Title  ")).toBe("Title");
  });

  it("ignores preamble before the first speaker and drops empty turns", () => {
    expect(parseDialogue("Here is your script:\nA: Hi\nB: [music]\nA: Bye")).toEqual([
      { speaker: "A", text: "Hi" },
      { speaker: "A", text: "Bye" },
    ]);
  });
});

describe("prompts and sizing", () => {
  const settings = { lengthMin: 8 as const, tone: "kids" as const, language: "fr" as const };
  const outline: Outline = {
    title: "T",
    summary: "S",
    chapters: [
      { title: "One", points: ["p"] },
      { title: "Two", points: [] },
      { title: "Three", points: [] },
    ],
  };

  it("chapter counts and word budgets scale with length", () => {
    expect([chapterCount(3), chapterCount(8), chapterCount(15)]).toEqual([2, 4, 6]);
    expect(wordsPerChapter({ ...settings, language: "en", lengthMin: 3 })).toBe(225);
    expect(chapterMaxTokens({ ...settings, language: "ar", lengthMin: 15 })).toBeGreaterThan(chapterMaxTokens({ ...settings, language: "en", lengthMin: 15 }));
    expect(chapterMaxTokens({ lengthMin: 15, tone: "casual", language: "ar" })).toBeLessThanOrEqual(8000);
  });

  it("outline prompt asks for the right language, chapter count and treats source as data", () => {
    const p = buildOutlinePrompt({ settings, source: "SRC", sourceLabel: "example.com" });
    expect(p.system).toContain("exactly 4 chapters");
    expect(p.system).toContain("French");
    expect(p.system).toContain("kids aged 8 to 12");
    expect(p.system).toMatch(/untrusted data/);
    expect(p.user).toContain("<<<\nSRC\n>>>");
  });

  it("follow-up outline includes what was already covered", () => {
    const p = buildOutlinePrompt({
      settings,
      source: "SRC",
      focus: { chapterTitle: "Quorum", points: ["a"], alreadyCovered: "Maya: hi", parentTitle: "Bees" },
    });
    expect(p.user).toContain('goes deeper on the chapter "Quorum"');
    expect(p.user).toContain("Maya: hi");
  });

  it("chapter prompt positions first/middle/last chapters", () => {
    const first = buildChapterPrompt({ settings, outline, index: 0, source: "S" });
    const mid = buildChapterPrompt({ settings, outline, index: 1, source: "S" });
    const last = buildChapterPrompt({ settings, outline, index: 2, source: "S" });
    expect(first.system).toContain("FIRST chapter");
    expect(first.system).toContain("Camille");
    expect(mid.system).toContain("MIDDLE chapter");
    expect(last.system).toContain("LAST chapter");
    expect(last.user).toContain("WRITE CHAPTER 3 of 3: Three");
  });
});

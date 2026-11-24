import { describe, expect, it } from "vitest";
import { chunkText, cleanSourceText, countWords, htmlToText, isRtlLanguage, sampleEvenly, splitForSpeech, splitSentences } from "../src/lib/text";

describe("text utilities", () => {
  it("cleans markdown links/images and whitespace", () => {
    expect(cleanSourceText("See [the docs](https://a.b/c(d)) ![img](x.png)\r\n\r\n\r\n\r\nNext   para")).toBe("See the docs\n\nNext para");
  });

  it("converts HTML to text and drops scripts", () => {
    const t = htmlToText("<html><script>alert(1)</script><h1>Title</h1><p>One &amp; two</p><p>Three</p></html>");
    expect(t).toContain("Title");
    expect(t).toContain("One & two");
    expect(t).not.toContain("alert");
  });

  it("splits sentences in Latin and Arabic scripts", () => {
    expect(splitSentences("Hello there. How are you? Fine!")).toEqual(["Hello there.", "How are you?", "Fine!"]);
    expect(splitSentences("مرحبا بكم. كيف حالك؟ بخير")).toEqual(["مرحبا بكم.", "كيف حالك؟", "بخير"]);
  });

  it("splitForSpeech never exceeds the limit and keeps all words", () => {
    const text = "This is a sentence that goes on. ".repeat(40) + "Supercalifragilistic".repeat(10);
    const parts = splitForSpeech(text, 120);
    expect(parts.every((p) => p.length <= 120)).toBe(true);
    expect(parts.join(" ").replace(/\s+/g, "")).toBe(text.replace(/\s+/g, ""));
    expect(splitForSpeech("short", 100)).toEqual(["short"]);
    expect(splitForSpeech("   ", 100)).toEqual([]);
  });

  it("chunkText packs paragraphs under the limit", () => {
    const paras = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} ` + "word ".repeat(50));
    const chunks = chunkText(paras.join("\n\n"), 1000);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((c) => c.length <= 1000)).toBe(true);
    expect(chunks.join("\n\n")).toContain("Paragraph 29");
  });

  it("sampleEvenly keeps first and last", () => {
    expect(sampleEvenly([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4)).toEqual([1, 4, 7, 10]);
    expect(sampleEvenly([1, 2], 4)).toEqual([1, 2]);
  });

  it("misc", () => {
    expect(countWords(" a  b\nc ")).toBe(3);
    expect(isRtlLanguage("ar")).toBe(true);
    expect(isRtlLanguage("en")).toBe(false);
  });
});

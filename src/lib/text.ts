/** Source-text cleanup and chunking. Pure functions (unit-tested). */

/** Remove markdown noise that would waste tokens; keep link text, drop images. */
export function cleanSourceText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]+)\]\((?:[^)(]|\([^)]*\))*\)/g, "$1") // links -> text
    .replace(/<[^>]+>/g, " ") // stray tags
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Very small HTML -> text conversion (used for .html uploads). */
export function htmlToText(html: string): string {
  return cleanSourceText(
    html
      .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|section|article|tr)>/gi, "\n\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'"),
  );
}

export function countWords(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

/**
 * Split text into sentences. Handles Latin punctuation, Arabic "؟" / "۔",
 * CJK full stops, and keeps the terminator attached to its sentence.
 */
export function splitSentences(text: string): string[] {
  const parts = text
    .replace(/\s+/g, " ")
    .trim()
    .match(/[^.!?؟。！？…]+(?:[.!?؟。！？…]+["'”’»)\]]*|$)\s*/g);
  return (parts ?? []).map((s) => s.trim()).filter(Boolean);
}

/** Hard-wrap a single over-long sentence at word boundaries (last resort). */
function wrapWords(sentence: string, maxChars: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of sentence.split(/\s+/)) {
    if (!w) continue;
    if (w.length > maxChars) {
      if (cur) out.push(cur);
      for (let i = 0; i < w.length; i += maxChars) out.push(w.slice(i, i + maxChars));
      cur = "";
      continue;
    }
    if ((cur ? cur.length + 1 : 0) + w.length > maxChars) {
      out.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  return out;
}

/** Split `text` into pieces of at most `maxChars`, preferring sentence boundaries. */
export function splitForSpeech(text: string, maxChars: number): string[] {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return [];
  if (t.length <= maxChars) return [t];
  const out: string[] = [];
  let cur = "";
  for (const s of splitSentences(t)) {
    const pieces = s.length > maxChars ? wrapWords(s, maxChars) : [s];
    for (const p of pieces) {
      if (!cur) cur = p;
      else if (cur.length + 1 + p.length <= maxChars) cur = `${cur} ${p}`;
      else {
        out.push(cur);
        cur = p;
      }
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Chunk a long document for map-style summarisation: paragraphs are packed into
 * chunks of at most `maxChars`; over-long paragraphs are split by sentence.
 */
export function chunkText(text: string, maxChars: number): string[] {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let cur = "";
  const push = () => {
    if (cur) chunks.push(cur);
    cur = "";
  };
  for (const para of paras) {
    const pieces = para.length > maxChars ? splitForSpeech(para, maxChars) : [para];
    for (const p of pieces) {
      if (!cur) cur = p;
      else if (cur.length + 2 + p.length <= maxChars) cur = `${cur}\n\n${p}`;
      else {
        push();
        cur = p;
      }
    }
  }
  push();
  return chunks;
}

/** Pick at most `max` chunks evenly spread over the document (keeps first and last). */
export function sampleEvenly<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) return [...items];
  if (max <= 1) return [items[0]];
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(items[Math.round((i * (items.length - 1)) / (max - 1))]);
  return out;
}

/** Arabic, Hebrew, Persian, Urdu → right-to-left. */
export function isRtlLanguage(lang: string): boolean {
  return /^(ar|he|fa|ur)\b/i.test(lang);
}

/** Segment planning (script → TTS calls) and the virtual episode timeline. */
import type { Script, Speaker } from "./script";
import { languageInfo } from "./script";
import { countWords, splitForSpeech } from "./text";

export interface Segment {
  id: string;
  chapter: number;
  speaker: Speaker;
  text: string;
}

/** Keep each TTS call well under every model's per-call cap and under the 1 MB inline limit. */
export const DEFAULT_SEGMENT_CHARS = 450;

export function segmentCharLimit(modelMaxChars?: number): number {
  if (!modelMaxChars || modelMaxChars <= 0) return DEFAULT_SEGMENT_CHARS;
  return Math.max(120, Math.min(DEFAULT_SEGMENT_CHARS, Math.floor(modelMaxChars * 0.9)));
}

/** One segment per dialogue turn; long turns are split at sentence boundaries. */
export function planSegments(script: Script, maxChars = DEFAULT_SEGMENT_CHARS): Segment[] {
  const out: Segment[] = [];
  script.chapters.forEach((ch, ci) => {
    ch.lines.forEach((line, li) => {
      splitForSpeech(line.text, maxChars).forEach((piece, pi) => {
        out.push({ id: `c${ci}-l${li}-p${pi}`, chapter: ci, speaker: line.speaker, text: piece });
      });
    });
  });
  return out;
}

/** Rough spoken duration in seconds (used before real audio exists). */
export function estimateSeconds(text: string, language: string): number {
  const wpm = languageInfo(language).wordsPerMinute;
  return Math.max(0.6, (countWords(text) / wpm) * 60);
}

export interface Timeline {
  starts: number[];
  total: number;
}

export function buildTimeline(durations: readonly number[]): Timeline {
  const starts: number[] = [];
  let acc = 0;
  for (const d of durations) {
    starts.push(acc);
    acc += Math.max(0, d || 0);
  }
  return { starts, total: acc };
}

/** Map a global time to (track index, offset inside the track). */
export function locate(timeline: Timeline, durations: readonly number[], t: number): { index: number; offset: number } {
  if (!durations.length) return { index: 0, offset: 0 };
  const clamped = Math.max(0, Math.min(t, timeline.total));
  for (let i = durations.length - 1; i >= 0; i--) {
    if (clamped >= timeline.starts[i]) {
      return { index: i, offset: Math.min(clamped - timeline.starts[i], Math.max(0, durations[i])) };
    }
  }
  return { index: 0, offset: 0 };
}

/** Start time of each chapter given per-segment starts. */
export function chapterStarts(segments: readonly Pick<Segment, "chapter">[], starts: readonly number[], chapterCount: number): number[] {
  const out = new Array<number>(chapterCount).fill(NaN);
  segments.forEach((s, i) => {
    if (Number.isNaN(out[s.chapter])) out[s.chapter] = starts[i] ?? 0;
  });
  // chapters without segments inherit the next known start
  for (let c = chapterCount - 1; c >= 0; c--) {
    if (Number.isNaN(out[c])) out[c] = c + 1 < chapterCount ? out[c + 1] : (starts[starts.length - 1] ?? 0);
  }
  return out;
}

export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

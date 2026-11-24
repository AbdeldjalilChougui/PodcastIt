/** A single shape the episode screen renders, built from a fresh draft or a stored record. */
import type { EpisodeRecord } from "./library";
import type { Draft } from "./pipeline";
import { buildTimeline, chapterStarts } from "./plan";
import type { EpisodeSettings, Speaker } from "./script";

export interface Track {
  /** Playable URL (blob: in-session, presigned https: for stored audio); null = skip. */
  src: string | null;
  duration: number;
  /** Still being voiced: the player waits for it instead of skipping. */
  pending?: boolean;
}

export interface ViewSegment {
  chapter: number;
  speaker: Speaker;
  text: string;
  start: number;
  duration: number;
  status: "pending" | "ok" | "failed";
}

export interface ViewEpisode {
  id: string;
  title: string;
  summary: string;
  createdAt: number;
  settings: EpisodeSettings;
  sourceLabel: string;
  parentId?: string;
  parentChapter?: string;
  chapters: { title: string; points: string[]; start: number }[];
  segments: ViewSegment[];
  tracks: Track[];
  totalDuration: number;
  voicesLabel?: string;
}

/** In-session episode: one track per segment (exact transcript sync). */
export function viewFromDraft(draft: Draft, urlFor: (index: number) => string | null): ViewEpisode {
  // pending segments keep their estimated duration so chapter positions stay meaningful
  const durations = draft.segments.map((s) => (s.status === "failed" ? 0 : s.duration));
  const tl = buildTimeline(durations);
  const starts = chapterStarts(draft.segments, tl.starts, draft.script.chapters.length);
  return {
    id: draft.id,
    title: draft.script.title,
    summary: draft.script.summary,
    createdAt: draft.createdAt,
    settings: draft.settings,
    sourceLabel: draft.source.label,
    parentId: draft.parentId,
    parentChapter: draft.parentChapter,
    chapters: draft.script.chapters.map((c, i) => ({ title: c.title, points: c.points, start: starts[i] })),
    segments: draft.segments.map((s, i) => ({
      chapter: s.chapter,
      speaker: s.speaker,
      text: s.text,
      start: tl.starts[i],
      duration: durations[i],
      status: s.status,
    })),
    tracks: draft.segments.map((s, i) => ({
      src: s.status === "ok" ? urlFor(i) : null,
      duration: durations[i],
      pending: s.status === "pending",
    })),
    totalDuration: tl.total,
    voicesLabel: draft.voices.modelLabel,
  };
}

/** Stored episode: tracks are the uploaded audio parts (may be empty if audio is missing). */
export function viewFromRecord(record: EpisodeRecord, tracks: Track[]): ViewEpisode {
  const total = tracks.length ? tracks.reduce((s, t) => s + t.duration, 0) : record.durationSec;
  return {
    id: record.id,
    title: record.title,
    summary: record.summary,
    createdAt: record.createdAt,
    settings: record.settings,
    sourceLabel: record.sourceLabel,
    parentId: record.parentId,
    parentChapter: record.parentChapter,
    chapters: record.chapters,
    segments: record.segments.map((s) => ({ ...s, status: s.ok ? "ok" : "failed" })),
    tracks,
    totalDuration: total,
  };
}

/** Index of the transcript segment playing at global time t (-1 if none). */
export function activeSegment(segments: readonly ViewSegment[], t: number): number {
  let found = -1;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (s.duration <= 0) continue;
    if (t >= s.start - 0.05) found = i;
    else break;
  }
  return found;
}

export function activeChapter(chapters: readonly { start: number }[], t: number): number {
  let c = 0;
  for (let i = 0; i < chapters.length; i++) if (t >= chapters[i].start - 0.05) c = i;
  return c;
}

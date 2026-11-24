/**
 * Personal episode library.
 *  - Metadata + transcript live in per-user app storage (`storage.*`, APS).
 *  - Audio is joined into ≤ 6 MB parts and stored through `upload.inline`; only the durable
 *    `r2_key` is persisted, and playback URLs are re-minted with `upload.confirm`.
 */
import type { HostApi } from "../host/types";
import { bytesToBase64, groupBySize, joinAudio, mimeFor } from "./audio";
import { normalizeError } from "./errors";
import type { Draft, VoicedSegment } from "./pipeline";
import { withRetry } from "./pool";
import { buildTimeline, chapterStarts } from "./plan";
import type { EpisodeSettings, Speaker } from "./script";

export const INDEX_KEY = "library/index";
export const MAX_INDEX = 200;
export const MAX_PART_BYTES = 6 * 1024 * 1024;
export const MAX_SOURCE_STORED = 30_000;

export interface EpisodeSummary {
  id: string;
  title: string;
  summary: string;
  createdAt: number;
  settings: EpisodeSettings;
  durationSec: number;
  chapterCount: number;
  sourceLabel: string;
  parentId?: string;
  hasAudio: boolean;
}

export interface StoredSegment {
  chapter: number;
  speaker: Speaker;
  text: string;
  start: number;
  duration: number;
  ok: boolean;
}

export interface AudioPart {
  r2Key: string;
  mime: string;
  start: number;
  duration: number;
}

export interface EpisodeRecord extends EpisodeSummary {
  v: 1;
  source: { kind: string; label: string; title?: string };
  chapters: { title: string; points: string[]; start: number }[];
  segments: StoredSegment[];
  audio: { parts: AudioPart[] } | null;
  voices: { model?: string; voiceA?: string; voiceB?: string };
  parentChapter?: string;
}

export interface SaveResult {
  record: EpisodeRecord;
  audioSaved: boolean;
  warning?: string;
}

/**
 * `storage.get` returns `{value, exists, etag}` on APS (production) but some harnesses return
 * the bare value. None of PodcastIt's stored values has a `value` key, so unwrap safely.
 */
export function unwrapGet<T>(res: unknown): T | null {
  if (res && typeof res === "object" && !Array.isArray(res) && Object.prototype.hasOwnProperty.call(res, "value")) {
    return ((res as { value: T | null }).value ?? null) as T | null;
  }
  return (res ?? null) as T | null;
}

const episodeKey = (id: string) => `episodes/${id}`;
const sourceKey = (id: string) => `sources/${id}`;

/** Seconds each segment occupies in the stored audio (segments without bytes are not stored). */
export function storedDurations(segments: readonly VoicedSegment[]): number[] {
  return segments.map((s) => (s.status === "ok" && s.bytes ? s.duration : 0));
}

/** Build the stored record from a draft (pure; audio parts filled in by `save`). */
export function draftToRecord(draft: Draft, parts: AudioPart[] | null): EpisodeRecord {
  const durations = storedDurations(draft.segments);
  const tl = buildTimeline(durations);
  const starts = chapterStarts(draft.segments, tl.starts, draft.script.chapters.length);
  return {
    v: 1,
    id: draft.id,
    title: draft.script.title,
    summary: draft.script.summary,
    createdAt: draft.createdAt,
    settings: draft.settings,
    durationSec: Math.round(tl.total * 10) / 10,
    chapterCount: draft.script.chapters.length,
    sourceLabel: draft.source.label,
    parentId: draft.parentId,
    parentChapter: draft.parentChapter,
    hasAudio: Boolean(parts && parts.length),
    source: draft.source,
    chapters: draft.script.chapters.map((c, i) => ({ title: c.title, points: c.points, start: starts[i] })),
    segments: draft.segments.map((s, i) => ({
      chapter: s.chapter,
      speaker: s.speaker,
      text: s.text,
      start: tl.starts[i],
      duration: durations[i],
      ok: durations[i] > 0,
    })),
    audio: parts && parts.length ? { parts } : null,
    voices: { model: draft.voices.model, voiceA: draft.voices.voiceA, voiceB: draft.voices.voiceB },
  };
}

export function toSummary(r: EpisodeRecord): EpisodeSummary {
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    createdAt: r.createdAt,
    settings: r.settings,
    durationSec: r.durationSec,
    chapterCount: r.chapterCount,
    sourceLabel: r.sourceLabel,
    parentId: r.parentId,
    hasAudio: r.hasAudio,
  };
}

/** Plan audio parts: consecutive voiced segments joined into files of ≤ maxBytes. */
export function planParts(segments: readonly VoicedSegment[], maxBytes = MAX_PART_BYTES): number[][] {
  const voiced = segments.map((s, i) => ({ s, i })).filter(({ s }) => s.status === "ok" && s.bytes);
  const groups = groupBySize(
    voiced.map(({ s }) => s.bytes!.length),
    maxBytes,
  );
  return groups.map((g) => g.map((k) => voiced[k].i));
}

export class LibraryStore {
  constructor(private readonly host: HostApi) {}

  async list(): Promise<EpisodeSummary[]> {
    const v = unwrapGet<EpisodeSummary[]>(await this.host.storage.get({ key: INDEX_KEY }));
    return Array.isArray(v) ? v.filter((e) => e && typeof e.id === "string") : [];
  }

  async load(id: string): Promise<EpisodeRecord | null> {
    const v = unwrapGet<EpisodeRecord>(await this.host.storage.get({ key: episodeKey(id) }));
    return v && typeof v === "object" && v.id === id ? v : null;
  }

  async loadSource(id: string): Promise<string | null> {
    try {
      const v = unwrapGet<string>(await this.host.storage.get({ key: sourceKey(id) }));
      return typeof v === "string" ? v : null;
    } catch {
      return null;
    }
  }

  /** Upload voiced audio and persist the episode. Audio failures degrade to transcript-only. */
  async save(draft: Draft): Promise<SaveResult> {
    let parts: AudioPart[] | null = null;
    let warning: string | undefined;
    try {
      parts = await this.uploadAudio(draft);
    } catch (err) {
      parts = null;
      warning = `Saved the transcript, but the audio could not be stored (${normalizeError(err).friendly}). You can voice it again from your library.`;
    }
    const record = draftToRecord(draft, parts);
    await this.host.storage.set({ key: episodeKey(record.id), value: record });
    try {
      await this.host.storage.set({ key: sourceKey(record.id), value: draft.material.slice(0, MAX_SOURCE_STORED) });
    } catch {
      /* optional: "Go deeper" falls back to the transcript */
    }
    await this.upsertIndex(toSummary(record));
    return { record, audioSaved: Boolean(parts), warning };
  }

  /** Replace the stored record (e.g. after re-voicing). */
  async update(record: EpisodeRecord): Promise<void> {
    await this.host.storage.set({ key: episodeKey(record.id), value: record });
    await this.upsertIndex(toSummary(record));
  }

  async remove(id: string): Promise<void> {
    const list = await this.list();
    await this.host.storage.set({ key: INDEX_KEY, value: list.filter((e) => e.id !== id) });
    for (const key of [episodeKey(id), sourceKey(id)]) {
      try {
        await this.host.storage.delete({ key });
      } catch {
        /* already gone */
      }
    }
  }

  /** Fresh playback URLs for a stored episode's audio parts. */
  async resolveAudio(record: EpisodeRecord): Promise<{ src: string; duration: number }[]> {
    if (!record.audio?.parts.length) return [];
    const out: { src: string; duration: number }[] = [];
    for (const part of record.audio.parts) {
      const res = await withRetry(() => this.host.upload.confirm({ r2_key: part.r2Key }), { attempts: 2 });
      if (!res?.download_url) throw new Error("No download URL");
      out.push({ src: res.download_url, duration: part.duration });
    }
    return out;
  }

  private async upsertIndex(summary: EpisodeSummary): Promise<void> {
    const list = await this.list();
    const next = [summary, ...list.filter((e) => e.id !== summary.id)].slice(0, MAX_INDEX);
    await this.host.storage.set({ key: INDEX_KEY, value: next });
  }

  private async uploadAudio(draft: Draft): Promise<AudioPart[] | null> {
    const groups = planParts(draft.segments);
    if (!groups.length) return null;
    const durations = storedDurations(draft.segments);
    const tl = buildTimeline(durations);
    const parts: AudioPart[] = [];
    for (let k = 0; k < groups.length; k++) {
      const idx = groups[k];
      const clips = idx.map((i) => draft.segments[i].bytes!);
      const joined = joinAudio(clips);
      if (!joined) throw new Error("Audio clips use different formats");
      const mime = mimeFor(joined.format);
      const ext = joined.format === "wav" ? "wav" : "mp3";
      const res = await withRetry(
        () =>
          this.host.upload.inline(
            {
              filename: `podcastit-${draft.id}-part${k + 1}.${ext}`,
              mime_type: mime,
              content_b64: bytesToBase64(joined.bytes),
              purpose: "user_artifact",
            },
            { timeoutMs: 120_000 },
          ),
        { attempts: 2 },
      );
      if (!res?.r2_key) throw new Error("Upload returned no key");
      const start = tl.starts[idx[0]];
      const duration = idx.reduce((s, i) => s + durations[i], 0);
      parts.push({ r2Key: res.r2_key, mime, start, duration });
    }
    return parts;
  }
}

/** Rebuild a voiceable draft from a stored record (used by "Voice again" for transcript-only episodes). */
export function draftFromRecord(record: EpisodeRecord, material: string, voices: Draft["voices"]): Draft {
  const chapters = record.chapters.map((c, ci) => ({
    title: c.title,
    points: c.points,
    lines: record.segments.filter((s) => s.chapter === ci).map((s) => ({ speaker: s.speaker, text: s.text })),
  }));
  return {
    id: record.id,
    createdAt: record.createdAt,
    settings: record.settings,
    source: record.source as Draft["source"],
    material,
    script: { title: record.title, summary: record.summary, chapters },
    voices,
    segments: record.segments.map((s, i) => ({
      id: `r${i}`,
      chapter: s.chapter,
      speaker: s.speaker,
      text: s.text,
      status: "pending" as const,
      duration: s.duration > 0 ? s.duration : Math.max(1, s.text.split(/\s+/).length / 2.5),
    })),
    parentId: record.parentId,
    parentChapter: record.parentChapter,
  };
}

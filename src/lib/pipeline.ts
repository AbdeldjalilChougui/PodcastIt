/**
 * The episode pipeline: source → (notes) → outline → chapter scripts → voiced segments.
 * Pure orchestration over the HostApi; every step reports progress and honours an AbortSignal.
 */
import type { HostApi } from "../host/types";
import { audioDuration, base64ToBytes, joinAudio, mimeFor, sniffFormat } from "./audio";
import { CancelledError, PodcastError, isCancelled, normalizeError } from "./errors";
import { complete } from "./llm";
import { mapPool, throwIfAborted, withRetry } from "./pool";
import { estimateSeconds, planSegments, segmentCharLimit, type Segment } from "./plan";
import {
  buildChapterPrompt,
  buildNotesPrompt,
  buildOutlinePrompt,
  chapterCount,
  chapterMaxTokens,
  languageInfo,
  parseDialogue,
  parseOutline,
  type Chapter,
  type EpisodeSettings,
  type Outline,
  type Script,
} from "./script";
import type { SourceDoc } from "./sources";
import { MAX_SOURCE_CHARS } from "./sources";
import { chunkText, sampleEvenly, splitForSpeech } from "./text";
import { planVoices, type VoicePlan } from "./voices";

/** Up to this many characters go to the model directly; longer sources are condensed first. */
export const DIRECT_SOURCE_CHARS = 24_000;
export const NOTES_CHUNK_CHARS = 10_000;
export const MAX_NOTE_CHUNKS = 16;
export const LLM_CONCURRENCY = 3;
export const TTS_CONCURRENCY = 3;

export type Stage = "reading" | "condensing" | "outlining" | "writing" | "voicing" | "saving" | "done";

export interface Progress {
  stage: Stage;
  done: number;
  total: number;
  note?: string;
}

export type ProgressFn = (p: Progress) => void;

export interface VoicedSegment extends Segment {
  status: "pending" | "ok" | "failed";
  bytes?: Uint8Array;
  url?: string;
  mime?: string;
  duration: number;
  error?: string;
}

export interface Draft {
  id: string;
  createdAt: number;
  settings: EpisodeSettings;
  source: { kind: SourceDoc["kind"]; label: string; title?: string };
  /** Material actually used to write the script (source or condensed notes). */
  material: string;
  script: Script;
  voices: VoicePlan;
  segments: VoicedSegment[];
  parentId?: string;
  parentChapter?: string;
}

export function newId(): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `ep_${Date.now().toString(36)}_${rnd}`;
}

const llmRetry = (signal?: AbortSignal) => ({
  attempts: 3,
  signal,
  shouldRetry: (err: unknown) => {
    if (isCancelled(err)) return false;
    if (err instanceof PodcastError) return err.retryable;
    return normalizeError(err).retryable;
  },
});

// ---------------------------------------------------------- 1. material --

export async function prepareMaterial(
  host: HostApi,
  doc: SourceDoc,
  settings: EpisodeSettings,
  onProgress: ProgressFn,
  signal?: AbortSignal,
): Promise<{ material: string; condensed: boolean }> {
  const text = doc.text.slice(0, MAX_SOURCE_CHARS);
  if (text.length <= DIRECT_SOURCE_CHARS) return { material: text, condensed: false };

  const all = chunkText(text, NOTES_CHUNK_CHARS);
  const chunks = sampleEvenly(all, MAX_NOTE_CHUNKS);
  let done = 0;
  const skipped = all.length - chunks.length;
  onProgress({
    stage: "condensing",
    done,
    total: chunks.length,
    note: skipped > 0 ? `Very long source: reading ${chunks.length} of ${all.length} sections` : undefined,
  });
  const notes = await mapPool(
    chunks,
    LLM_CONCURRENCY,
    async (chunk, i) => {
      const p = buildNotesPrompt(chunk, i + 1, chunks.length, settings.language);
      try {
        const out = await withRetry(
          () => complete(host, { system: p.system, user: p.user, maxTokens: 700, temperature: 0.3, tag: "notes" }),
          llmRetry(signal),
        );
        return out.text;
      } catch (err) {
        if (isCancelled(err)) throw err;
        const n = normalizeError(err);
        if (n.name === "APP_QUOTA_EXCEEDED" || n.name === "APP_NOT_GRANTED") throw err;
        return ""; // one unreadable section should not sink the episode
      } finally {
        done++;
        onProgress({ stage: "condensing", done, total: chunks.length });
      }
    },
    signal,
  );
  const usable = notes.map((n, i) => (n ? `SECTION ${i + 1}:\n${n}` : "")).filter(Boolean);
  if (!usable.length) throw new PodcastError("condense_failed", "PodcastIt could not read this long document. Try again in a moment.", true);
  return { material: usable.join("\n\n"), condensed: true };
}

// ----------------------------------------------------------- 2. script --

export async function writeOutline(
  host: HostApi,
  material: string,
  settings: EpisodeSettings,
  sourceLabel: string,
  signal?: AbortSignal,
  focus?: Parameters<typeof buildOutlinePrompt>[0]["focus"],
): Promise<Outline> {
  const p = buildOutlinePrompt({ settings, source: material, sourceLabel, focus });
  return withRetry(async () => {
    const out = await complete(host, { system: p.system, user: p.user, maxTokens: 900, temperature: 0.7, tag: "outline" });
    return parseOutline(out.text, chapterCount(settings.lengthMin));
  }, llmRetry(signal));
}

/** Drop a final line that was cut mid-sentence by the token cap. */
function dropCutLine(chapter: Chapter, truncated: boolean): Chapter {
  if (!truncated || chapter.lines.length < 2) return chapter;
  const last = chapter.lines[chapter.lines.length - 1];
  if (/[.!?؟。…"'”»)]$/.test(last.text)) return chapter;
  return { ...chapter, lines: chapter.lines.slice(0, -1) };
}

export async function writeChapters(
  host: HostApi,
  outline: Outline,
  material: string,
  settings: EpisodeSettings,
  onProgress: ProgressFn,
  signal?: AbortSignal,
  deeper = false,
): Promise<Chapter[]> {
  const names = languageInfo(settings.language).hosts;
  let done = 0;
  onProgress({ stage: "writing", done, total: outline.chapters.length });
  const chapters = await mapPool(
    outline.chapters,
    LLM_CONCURRENCY,
    async (plan, index) => {
      const p = buildChapterPrompt({ settings, outline, index, source: material, deeper });
      const chapter = await withRetry(async () => {
        const out = await complete(host, {
          system: p.system,
          user: p.user,
          maxTokens: chapterMaxTokens(settings),
          temperature: 0.85,
          tag: "chapter",
        });
        const lines = parseDialogue(out.text, names);
        if (lines.length < 2) throw new PodcastError("script_parse", "The AI returned a script PodcastIt could not read.", true);
        return dropCutLine({ ...plan, lines }, out.truncated);
      }, llmRetry(signal));
      done++;
      onProgress({ stage: "writing", done, total: outline.chapters.length });
      return chapter;
    },
    signal,
  );
  return chapters;
}

// ---------------------------------------------------------- 3. voicing --

const FATAL_TTS = new Set(["APP_QUOTA_EXCEEDED", "APP_NOT_GRANTED", "AUDIO_MODEL_UNAVAILABLE"]);

export async function loadVoicePlan(
  host: HostApi,
  language: string,
  prefs?: { voiceA?: string; voiceB?: string },
): Promise<VoicePlan> {
  try {
    const cat = await host.llm.catalog({ serviceType: "tts", voiceLanguage: language }, { timeoutMs: 20_000 });
    const plan = planVoices(cat, language, prefs);
    if (plan.voices.length) return plan;
    const all = await host.llm.catalog({ serviceType: "tts" }, { timeoutMs: 20_000 });
    return planVoices(all, language, prefs);
  } catch {
    return planVoices(null, language, prefs); // host default model + voice
  }
}

interface SpokenClip {
  bytes?: Uint8Array;
  url?: string;
  mime: string;
  duration: number;
}

async function speakOnce(host: HostApi, text: string, voice: string | undefined, plan: VoicePlan, language: string): Promise<SpokenClip> {
  const res = await host.audio.speak(
    { text, voice, model: plan.model, language, format: "mp3", delivery: "inline" },
    { timeoutMs: 125_000 },
  );
  if (res?.audioBase64) {
    const bytes = base64ToBytes(res.audioBase64);
    const fmt = sniffFormat(bytes);
    const duration = audioDuration(bytes) ?? res.durationSec ?? estimateSeconds(text, language);
    return { bytes, mime: fmt === "unknown" ? res.mimeType ?? "audio/mpeg" : mimeFor(fmt), duration };
  }
  if (res?.url) {
    return { url: res.url, mime: res.mimeType ?? "audio/mpeg", duration: res.durationSec ?? estimateSeconds(text, language) };
  }
  throw new PodcastError("tts_empty", "The voice service returned no audio.", true);
}

/** Speak one segment with retries, voice fallback and split-on-too-long. */
export async function speakSegment(
  host: HostApi,
  seg: Segment,
  plan: VoicePlan,
  language: string,
  signal?: AbortSignal,
): Promise<SpokenClip> {
  let voice = seg.speaker === "A" ? plan.voiceA : plan.voiceB;
  return withRetry(
    async () => {
      try {
        return await speakOnce(host, seg.text, voice, plan, language);
      } catch (err) {
        const n = normalizeError(err);
        if (n.name === "AUDIO_VOICE_INVALID" && voice) {
          voice = undefined; // fall back to the model's default voice
          return await speakOnce(host, seg.text, voice, plan, language);
        }
        if (n.name === "AUDIO_TEXT_TOO_LONG" && seg.text.length > 60) {
          const half = splitForSpeech(seg.text, Math.ceil(seg.text.length / 2) + 20);
          const clips: SpokenClip[] = [];
          for (const piece of half) clips.push(await speakOnce(host, piece, voice, plan, language));
          if (clips.every((c) => c.bytes)) {
            const joined = joinAudio(clips.map((c) => c.bytes!));
            if (joined) {
              return {
                bytes: joined.bytes,
                mime: mimeFor(joined.format),
                duration: clips.reduce((s, c) => s + c.duration, 0),
              };
            }
          }
          throw err;
        }
        throw err;
      }
    },
    {
      attempts: 3,
      signal,
      shouldRetry: (err) => !isCancelled(err) && !FATAL_TTS.has(normalizeError(err).name) && normalizeError(err).retryable,
    },
  );
}

/**
 * Voice every segment whose status is not "ok". Failed segments are marked and skipped,
 * unless the failure is fatal for all of them (quota, no TTS model), which aborts.
 */
export async function voiceSegments(
  host: HostApi,
  segments: VoicedSegment[],
  plan: VoicePlan,
  language: string,
  onProgress: ProgressFn,
  onSegment?: (index: number, seg: VoicedSegment) => void,
  signal?: AbortSignal,
): Promise<VoicedSegment[]> {
  const todo = segments.map((s, i) => ({ s, i })).filter(({ s }) => s.status !== "ok");
  let done = 0;
  onProgress({ stage: "voicing", done, total: todo.length });
  const inner = new AbortController();
  const onAbort = () => inner.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) inner.abort();
  let fatal: unknown = null;
  try {
    await mapPool(
      todo,
      TTS_CONCURRENCY,
      async ({ s, i }) => {
        throwIfAborted(inner.signal);
        try {
          const clip = await speakSegment(host, s, plan, language, inner.signal);
          segments[i] = { ...s, status: "ok", bytes: clip.bytes, url: clip.url, mime: clip.mime, duration: clip.duration, error: undefined };
        } catch (err) {
          if (isCancelled(err)) throw err;
          const n = normalizeError(err);
          if (FATAL_TTS.has(n.name)) {
            fatal = err;
            inner.abort();
            throw new CancelledError();
          }
          segments[i] = { ...s, status: "failed", duration: 0, error: err instanceof PodcastError ? err.message : n.friendly };
        }
        done++;
        onSegment?.(i, segments[i]);
        onProgress({ stage: "voicing", done, total: todo.length });
      },
      inner.signal,
    );
  } catch (err) {
    if (fatal) throw new PodcastError(normalizeError(fatal).name, normalizeError(fatal).friendly);
    throw err;
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
  return segments;
}

// ------------------------------------------------------------- 4. all --

export interface GenerateOptions {
  settings: EpisodeSettings;
  doc: SourceDoc;
  voicePrefs?: { voiceA?: string; voiceB?: string };
  focus?: { parentId: string; parentTitle: string; chapterTitle: string; points: string[]; alreadyCovered: string };
  onProgress: ProgressFn;
  /** Called once the script exists, before voicing starts. */
  onScript?: (draft: Draft) => void;
  onSegment?: (index: number, seg: VoicedSegment) => void;
  signal?: AbortSignal;
}

export async function generateEpisode(host: HostApi, opts: GenerateOptions): Promise<Draft> {
  const { settings, doc, signal, onProgress } = opts;
  onProgress({ stage: "reading", done: 1, total: 1 });
  const voicesPromise = loadVoicePlan(host, settings.language, opts.voicePrefs);

  const { material } = await prepareMaterial(host, doc, settings, onProgress, signal);
  throwIfAborted(signal);

  onProgress({ stage: "outlining", done: 0, total: 1 });
  const outline = await writeOutline(
    host,
    material,
    settings,
    doc.label,
    signal,
    opts.focus
      ? {
          parentTitle: opts.focus.parentTitle,
          chapterTitle: opts.focus.chapterTitle,
          points: opts.focus.points,
          alreadyCovered: opts.focus.alreadyCovered,
        }
      : undefined,
  );
  onProgress({ stage: "outlining", done: 1, total: 1 });

  const chapters = await writeChapters(host, outline, material, settings, onProgress, signal, Boolean(opts.focus));
  const script: Script = { title: outline.title, summary: outline.summary, chapters };

  const voices = await voicesPromise;
  const segments: VoicedSegment[] = planSegments(script, segmentCharLimit(voices.maxCharsPerCall)).map((s) => ({
    ...s,
    status: "pending",
    duration: estimateSeconds(s.text, settings.language),
  }));
  const draft: Draft = {
    id: newId(),
    createdAt: Date.now(),
    settings,
    source: { kind: doc.kind, label: doc.label, title: doc.title },
    material,
    script,
    voices,
    segments,
    parentId: opts.focus?.parentId,
    parentChapter: opts.focus?.chapterTitle,
  };
  opts.onScript?.(draft);

  await voiceSegments(host, draft.segments, voices, settings.language, onProgress, opts.onSegment, signal);
  if (!draft.segments.some((s) => s.status === "ok")) {
    const firstErr = draft.segments.find((s) => s.error)?.error;
    throw new PodcastError("tts_all_failed", `No audio could be generated. ${firstErr ?? ""}`.trim(), true);
  }
  return draft;
}

import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { activeChapter, activeSegment, type ViewEpisode } from "../lib/episode";
import { formatTime } from "../lib/plan";
import { languageInfo, LANGUAGES, TONES, type LengthMin } from "../lib/script";
import { isRtlLanguage } from "../lib/text";
import { Cover } from "./Cover";
import { IconBack, IconBackArrow, IconFwd, IconPause, IconPlay, IconRetry, IconSpark, IconTrash } from "./icons";
import { SPEEDS, usePlayer } from "./usePlayer";

export interface Banner {
  kind: "info" | "success" | "warning" | "error";
  text: string;
  action?: { label: string; run: () => void };
}

interface Props {
  view: ViewEpisode;
  busy: boolean;
  banners: Banner[];
  backLabel: string;
  onBack: () => void;
  onGoDeeper?: (chapter: number, lengthMin: LengthMin) => void;
  onDelete?: () => void;
  onTrackError?: (index: number) => void;
  children?: ComponentChildren;
}

export function EpisodeView({ view, busy, banners, backLabel, onBack, onGoDeeper, onDelete, onTrackError, children }: Props) {
  const player = usePlayer(view.tracks, { title: view.title, onTrackError });
  const names = languageInfo(view.settings.language).hosts;
  const rtl = isRtlLanguage(view.settings.language);
  const current = activeSegment(view.segments, player.time);
  const curChapter = activeChapter(view.chapters, player.time);
  const [deeperFor, setDeeperFor] = useState<number | null>(null);
  const [deeperLen, setDeeperLen] = useState<LengthMin>(8);
  const [follow, setFollow] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const hasAudio = view.tracks.some((t) => t.src || t.pending);
  const voicedCount = view.segments.filter((s) => s.status === "ok").length;

  useEffect(() => {
    if (!follow || !player.playing || current < 0) return;
    const box = transcriptRef.current;
    const el = box?.querySelector<HTMLElement>(`[data-seg="${current}"]`);
    if (!box || !el) return;
    const top = el.offsetTop - box.offsetTop - box.clientHeight / 3;
    box.scrollTo({ top, behavior: "smooth" });
  }, [current, follow, player.playing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") return;
      if (e.code === "Space") {
        e.preventDefault();
        player.toggle();
      } else if (e.key === "ArrowRight") player.skip(15);
      else if (e.key === "ArrowLeft") player.skip(-15);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player]);

  const byChapter = useMemo(() => {
    const groups = view.chapters.map(() => [] as number[]);
    view.segments.forEach((s, i) => groups[s.chapter]?.push(i));
    return groups;
  }, [view]);

  const langLabel = LANGUAGES.find((l) => l.code === view.settings.language)?.label ?? view.settings.language;
  const toneLabel = TONES.find((t) => t.value === view.settings.tone)?.label ?? view.settings.tone;
  const nextSpeed = SPEEDS[(SPEEDS.indexOf(player.rate) + 1) % SPEEDS.length];

  return (
    <article class="episode" dir="auto">
      <div class="topbar">
        <button type="button" class="btn ghost back" onClick={onBack}>
          <IconBackArrow size={18} /> {backLabel}
        </button>
        {onDelete &&
          (confirmDelete ? (
            <span class="confirm">
              <button type="button" class="btn danger-solid" onClick={onDelete}>
                <IconTrash size={18} /> Delete for good
              </button>
              <button type="button" class="btn ghost" onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
            </span>
          ) : (
            <button type="button" class="btn ghost danger" onClick={() => setConfirmDelete(true)} aria-label="Delete episode">
              <IconTrash size={18} /> <span class="hide-sm">Delete</span>
            </button>
          ))}
      </div>

      <header class="ep-head">
        <Cover title={view.title} size={112} />
        <div class="ep-meta">
          {view.parentChapter && <p class="eyebrow">Going deeper · {view.parentChapter}</p>}
          <h1 class="display ep-title" dir="auto">
            {view.title}
          </h1>
          {view.summary && (
            <p class="lede" dir="auto">
              {view.summary}
            </p>
          )}
          <p class="tags">
            <span>{formatTime(view.totalDuration)}</span>
            <span>{langLabel}</span>
            <span>{toneLabel}</span>
            <span class="clip">{view.sourceLabel}</span>
          </p>
        </div>
      </header>

      {banners.map((b) => (
        <div class={`banner ${b.kind}`} role={b.kind === "error" ? "alert" : "status"}>
          <span>{b.text}</span>
          {b.action && (
            <button type="button" class="btn small" onClick={b.action.run}>
              <IconRetry size={16} /> {b.action.label}
            </button>
          )}
        </div>
      ))}

      {children}

      {hasAudio && (
        <section class="card player" aria-label="Player">
          <div class="player-main">
            <button type="button" class="ctl" onClick={() => player.skip(-15)} aria-label="Back 15 seconds">
              <IconBack size={24} />
            </button>
            <button
              type="button"
              class={player.playing ? "play on" : "play"}
              onClick={player.toggle}
              aria-label={player.playing ? "Pause" : "Play"}
            >
              {player.playing ? <IconPause size={30} /> : <IconPlay size={30} />}
            </button>
            <button type="button" class="ctl" onClick={() => player.skip(15)} aria-label="Forward 15 seconds">
              <IconFwd size={24} />
            </button>
            <button
              type="button"
              class="speed"
              onClick={() => player.setRate(nextSpeed)}
              aria-label={`Playback speed ${player.rate}x, change to ${nextSpeed}x`}
            >
              {player.rate}×
            </button>
          </div>
          <div class="scrub">
            <span class="time">{formatTime(player.time)}</span>
            <div class="track">
              <div class="chapter-ticks" aria-hidden="true">
                {view.chapters.map((c) =>
                  player.total > 0 && c.start > 0 ? <i style={{ left: `${(c.start / player.total) * 100}%` }} /> : null,
                )}
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(1, player.total)}
                step={0.1}
                value={player.time}
                aria-label="Seek"
                onInput={(e) => player.seek(Number((e.target as HTMLInputElement).value))}
                style={{ "--p": `${player.total ? (player.time / player.total) * 100 : 0}%` }}
              />
            </div>
            <span class="time">{formatTime(player.total)}</span>
          </div>
          <p class="now muted small" aria-live="off">
            {player.waiting
              ? "Waiting for the next voice clip…"
              : player.error
                ? player.error
                : `Chapter ${curChapter + 1}: ${view.chapters[curChapter]?.title ?? ""}`}
          </p>
          {busy && voicedCount > 0 && <p class="muted small">You can start listening — the rest is still being recorded.</p>}
        </section>
      )}

      <section class="card chapters" aria-label="Chapters">
        <h2 class="section-title">Chapters</h2>
        <ol>
          {view.chapters.map((c, i) => (
            <li class={i === curChapter && hasAudio ? "chapter on" : "chapter"}>
              <button
                type="button"
                class="chapter-jump"
                onClick={() => {
                  player.seek(c.start);
                  if (!player.playing) player.play();
                }}
                disabled={!hasAudio}
              >
                <span class="num">{i + 1}</span>
                <span class="ch-text">
                  <strong dir="auto">{c.title}</strong>
                  {c.points.length > 0 && (
                    <span class="muted small" dir="auto">
                      {c.points.slice(0, 3).join(" · ")}
                    </span>
                  )}
                </span>
                {hasAudio && <span class="time small">{formatTime(c.start)}</span>}
              </button>
              {onGoDeeper && !busy && (
                <div class="deeper">
                  {deeperFor === i ? (
                    <div class="deeper-panel">
                      <span class="small">Follow-up episode on this chapter:</span>
                      <div class="chips tight">
                        {([3, 8] as LengthMin[]).map((len) => (
                          <button
                            type="button"
                            class={deeperLen === len ? "chip on" : "chip"}
                            aria-pressed={deeperLen === len}
                            onClick={() => setDeeperLen(len)}
                          >
                            <strong>{len} min</strong>
                          </button>
                        ))}
                      </div>
                      <button type="button" class="btn primary" onClick={() => onGoDeeper(i, deeperLen)}>
                        <IconSpark size={16} /> Make it
                      </button>
                      <button type="button" class="btn ghost" onClick={() => setDeeperFor(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button type="button" class="btn ghost small" onClick={() => setDeeperFor(i)}>
                      <IconSpark size={16} /> Go deeper
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section class="card transcript-card" aria-label="Transcript">
        <div class="section-row">
          <h2 class="section-title">Transcript</h2>
          {hasAudio && (
            <label class="follow small">
              <input type="checkbox" checked={follow} onChange={(e) => setFollow((e.target as HTMLInputElement).checked)} /> Follow
              along
            </label>
          )}
        </div>
        <div class="transcript" ref={transcriptRef} dir={rtl ? "rtl" : "ltr"} lang={view.settings.language}>
          {view.chapters.map((c, ci) => (
            <div class="t-chapter">
              <h3 dir="auto">
                {ci + 1}. {c.title}
              </h3>
              {byChapter[ci].map((si) => {
                const s = view.segments[si];
                const prev = si > 0 ? view.segments[si - 1] : null;
                const showName = !prev || prev.speaker !== s.speaker || prev.chapter !== s.chapter;
                return (
                  <p
                    data-seg={si}
                    class={`line ${s.speaker === "A" ? "host-a" : "host-b"}${si === current ? " now" : ""}${s.status === "failed" ? " failed" : ""}${s.status === "pending" ? " pending" : ""}`}
                    onClick={() => s.duration > 0 && view.tracks.length && player.seek(s.start)}
                  >
                    {showName && <span class="who">{names[s.speaker]}</span>}
                    <span dir="auto">{s.text}</span>
                  </p>
                );
              })}
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}

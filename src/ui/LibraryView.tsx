import type { EpisodeSummary } from "../lib/library";
import { formatTime } from "../lib/plan";
import { LANGUAGES } from "../lib/script";
import { Cover } from "./Cover";
import { IconRetry } from "./icons";

interface Props {
  items: EpisodeSummary[] | null;
  error: string | null;
  onOpen: (id: string) => void;
  onRetry: () => void;
  onCreate: () => void;
}

function when(ts: number): string {
  const d = new Date(ts);
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days < 1) return `Today, ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  if (days < 2) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString();
}

export function LibraryView({ items, error, onOpen, onRetry, onCreate }: Props) {
  if (error) {
    return (
      <section class="card empty" role="alert">
        <p>{error}</p>
        <button type="button" class="btn" onClick={onRetry}>
          <IconRetry size={16} /> Try again
        </button>
      </section>
    );
  }
  if (!items) {
    return (
      <section class="library" aria-busy="true">
        {[0, 1, 2].map(() => (
          <div class="lib-item skeleton" />
        ))}
      </section>
    );
  }
  if (!items.length) {
    return (
      <section class="card empty">
        <h2 class="section-title">Your library is empty</h2>
        <p class="muted">Every episode you make is saved here, with its chapters and transcript.</p>
        <button type="button" class="btn primary" onClick={onCreate}>
          Make your first episode
        </button>
      </section>
    );
  }
  return (
    <section class="library" aria-label="Your episodes">
      {items.map((e) => (
        <button type="button" class="lib-item" onClick={() => onOpen(e.id)}>
          <Cover title={e.title} size={64} />
          <span class="lib-text">
            <strong dir="auto">{e.title}</strong>
            <span class="muted small" dir="auto">
              {e.summary}
            </span>
            <span class="tags small">
              <span>{formatTime(e.durationSec)}</span>
              <span>{LANGUAGES.find((l) => l.code === e.settings.language)?.label ?? e.settings.language}</span>
              <span>{e.chapterCount} chapters</span>
              {e.parentId && <span>Follow-up</span>}
              {!e.hasAudio && <span class="warn">Transcript only</span>}
              <span>{when(e.createdAt)}</span>
            </span>
          </span>
        </button>
      ))}
    </section>
  );
}

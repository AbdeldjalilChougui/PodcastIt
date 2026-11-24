import type { Progress, Stage } from "../lib/pipeline";
import { IconCheck } from "./icons";

const STEPS: { stage: Stage; label: string; weight: number }[] = [
  { stage: "reading", label: "Reading the source", weight: 6 },
  { stage: "condensing", label: "Condensing a long source", weight: 14 },
  { stage: "outlining", label: "Planning the chapters", weight: 10 },
  { stage: "writing", label: "Writing the conversation", weight: 30 },
  { stage: "voicing", label: "Recording the voices", weight: 36 },
  { stage: "saving", label: "Saving to your library", weight: 4 },
];

export function overallPercent(p: Progress, condensed: boolean): number {
  const steps = STEPS.filter((s) => condensed || s.stage !== "condensing");
  const totalW = steps.reduce((s, x) => s + x.weight, 0);
  let acc = 0;
  for (const s of steps) {
    if (s.stage === p.stage) {
      const frac = p.total > 0 ? Math.min(1, p.done / p.total) : 0;
      return Math.round(((acc + s.weight * frac) / totalW) * 100);
    }
    acc += s.weight;
  }
  return p.stage === "done" ? 100 : 0;
}

function stepDetail(p: Progress, stage: Stage): string {
  if (p.stage !== stage || p.total <= 1) return "";
  if (stage === "voicing") return `${p.done} / ${p.total} segments`;
  if (stage === "writing") return `chapter ${Math.min(p.done + 1, p.total)} of ${p.total}`;
  if (stage === "condensing") return `${p.done} / ${p.total} sections`;
  return `${p.done} / ${p.total}`;
}

export function ProgressPanel({
  progress,
  condensed,
  onCancel,
}: {
  progress: Progress;
  condensed: boolean;
  onCancel?: () => void;
}) {
  const steps = STEPS.filter((s) => condensed || s.stage !== "condensing");
  const activeIdx = steps.findIndex((s) => s.stage === progress.stage);
  const pct = overallPercent(progress, condensed);
  return (
    <section class="card progress" aria-live="polite" aria-busy="true">
      <div class="progress-head">
        <div>
          <p class="eyebrow">Producing your episode</p>
          <p class="progress-title">{steps[activeIdx]?.label ?? "Working"}…</p>
        </div>
        <span class="pct">{pct}%</span>
      </div>
      <div class="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <ol class="steps">
        {steps.map((s, i) => {
          const state = i < activeIdx ? "done" : i === activeIdx ? "active" : "todo";
          return (
            <li class={`step ${state}`}>
              <span class="dot">{state === "done" ? <IconCheck size={14} /> : null}</span>
              <span class="step-label">{s.label}</span>
              <span class="muted small">{stepDetail(progress, s.stage)}</span>
            </li>
          );
        })}
      </ol>
      {progress.note && <p class="muted small">{progress.note}</p>}
      {onCancel && (
        <button type="button" class="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      )}
    </section>
  );
}

import { useEffect, useRef, useState } from "preact/hooks";
import type { HostApi } from "../host/types";
import { PodcastError, userMessage } from "../lib/errors";
import { loadVoicePlan } from "../lib/pipeline";
import { LANGUAGES, LENGTHS, TONES, languageInfo, type EpisodeSettings, type LangCode } from "../lib/script";
import { ACCEPTED_FILES, fetchUrlSource, fileSource, textSource, type SourceDoc } from "../lib/sources";
import type { VoicePlan } from "../lib/voices";
import { IconFile, IconLink, IconText, IconUpload } from "./icons";

export type SourceMode = "url" | "file" | "text";

export interface Prefill {
  url?: string;
  text?: string;
  lengthMin?: number;
  tone?: string;
  language?: string;
  nonce?: number;
}

export interface CreateRequest {
  settings: EpisodeSettings;
  voicePrefs: { voiceA?: string; voiceB?: string };
  /** Resolves the source (URL fetch / file read / paste); errors surface in the form. */
  loadSource: () => Promise<SourceDoc>;
  sourceHint: string;
}

interface Props {
  host: HostApi;
  busy: boolean;
  prefill?: Prefill;
  onCreate: (req: CreateRequest) => void;
}

export function CreateForm({ host, busy, prefill, onCreate }: Props) {
  const [mode, setMode] = useState<SourceMode>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [settings, setSettings] = useState<EpisodeSettings>({ lengthMin: 8, tone: "casual", language: "en" });
  const [voices, setVoices] = useState<VoicePlan | null>(null);
  const [voicePrefs, setVoicePrefs] = useState<{ voiceA?: string; voiceB?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!prefill) return;
    if (prefill.url) {
      setMode("url");
      setUrl(prefill.url);
    } else if (prefill.text) {
      setMode("text");
      setText(prefill.text);
    }
    setSettings((s) => ({
      lengthMin: prefill.lengthMin === 3 || prefill.lengthMin === 8 || prefill.lengthMin === 15 ? prefill.lengthMin : s.lengthMin,
      tone: prefill.tone === "deep-dive" || prefill.tone === "kids" || prefill.tone === "casual" ? prefill.tone : s.tone,
      language: LANGUAGES.some((l) => l.code === prefill.language) ? (prefill.language as LangCode) : s.language,
    }));
  }, [prefill?.nonce, prefill?.url, prefill?.text]);

  useEffect(() => {
    let alive = true;
    setVoices(null);
    loadVoicePlan(host, settings.language).then((plan) => {
      if (!alive) return;
      setVoices(plan);
      setVoicePrefs({ voiceA: plan.voiceA, voiceB: plan.voiceB });
    });
    return () => {
      alive = false;
    };
  }, [host, settings.language]);

  const lang = languageInfo(settings.language);
  const estChars = settings.lengthMin * lang.wordsPerMinute * 6;
  const ttsCost = voices?.cuPer1kChars ? Math.ceil((estChars / 1000) * voices.cuPer1kChars) : null;

  const ready = mode === "url" ? url.trim().length > 3 : mode === "file" ? Boolean(file) : text.trim().length > 0;

  function submit(e: Event) {
    e.preventDefault();
    setError(null);
    if (!ready || busy) return;
    const snapshotUrl = url;
    const snapshotText = text;
    const snapshotFile = file;
    const loadSource = async () => {
      if (mode === "url") return fetchUrlSource(host, snapshotUrl);
      if (mode === "file") {
        if (!snapshotFile) throw new PodcastError("file_none", "Choose a file first.");
        return fileSource(snapshotFile);
      }
      return textSource(snapshotText);
    };
    // Validate cheap cases synchronously so the user gets instant feedback.
    try {
      if (mode === "text") textSource(snapshotText);
    } catch (err) {
      setError(userMessage(err));
      return;
    }
    onCreate({
      settings,
      voicePrefs,
      loadSource,
      sourceHint: mode === "url" ? snapshotUrl : mode === "file" ? snapshotFile?.name ?? "file" : "pasted text",
    });
  }

  function pickFile(f: File | null | undefined) {
    setError(null);
    if (!f) return;
    setFile(f);
    setMode("file");
  }

  return (
    <form class="create" onSubmit={submit} aria-labelledby="create-title">
      <section class="hero">
        <h1 id="create-title" class="display">
          Turn anything you'd read into a show you can <em>listen</em> to.
        </h1>
        <p class="lede">
          Paste a link, drop a PDF or paste text. Two AI hosts — {lang.hosts.A}, the curious one, and {lang.hosts.B}, the expert —
          talk it through, with chapters and a transcript.
        </p>
      </section>

      <section class="card source-card">
        <div class="segmented" role="tablist" aria-label="Source type">
          {(
            [
              ["url", "Link", IconLink],
              ["file", "File", IconFile],
              ["text", "Text", IconText],
            ] as const
          ).map(([m, label, Icon]) => (
            <button
              type="button"
              role="tab"
              aria-selected={mode === m}
              class={mode === m ? "seg on" : "seg"}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {mode === "url" && (
          <label class="field">
            <span class="sr-only">Article or page link</span>
            <input
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://… an article, blog post or docs page"
              value={url}
              onInput={(e) => setUrl((e.target as HTMLInputElement).value)}
            />
          </label>
        )}

        {mode === "file" && (
          <div
            class={dragOver ? "dropzone over" : "dropzone"}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pickFile(e.dataTransfer?.files?.[0]);
            }}
          >
            <IconUpload size={26} />
            <div>
              <strong>{file ? file.name : "Choose a PDF or text file"}</strong>
              <span class="muted small">
                {file ? `${(file.size / 1024 / 1024).toFixed(file.size > 1e6 ? 1 : 2)} MB` : "PDF, TXT, Markdown, HTML or subtitles · up to 25 MB"}
              </span>
            </div>
            <button type="button" class="btn ghost" onClick={() => fileInput.current?.click()}>
              {file ? "Change" : "Browse"}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED_FILES}
              hidden
              onChange={(e) => pickFile((e.target as HTMLInputElement).files?.[0])}
            />
          </div>
        )}

        {mode === "text" && (
          <label class="field">
            <span class="sr-only">Text to turn into an episode</span>
            <textarea
              rows={7}
              placeholder="Paste notes, an essay, a chapter, a report…"
              value={text}
              onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
            />
            <span class="muted small counter">{text.trim() ? `${text.trim().split(/\s+/).length.toLocaleString()} words` : ""}</span>
          </label>
        )}
      </section>

      <section class="card options">
        <fieldset>
          <legend>Length</legend>
          <div class="chips">
            {LENGTHS.map((l) => (
              <button
                type="button"
                class={settings.lengthMin === l.value ? "chip on" : "chip"}
                aria-pressed={settings.lengthMin === l.value}
                onClick={() => setSettings({ ...settings, lengthMin: l.value })}
              >
                <strong>{l.label}</strong>
                <span>{l.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Tone</legend>
          <div class="chips">
            {TONES.map((t) => (
              <button
                type="button"
                class={settings.tone === t.value ? "chip on" : "chip"}
                aria-pressed={settings.tone === t.value}
                onClick={() => setSettings({ ...settings, tone: t.value })}
              >
                <strong>{t.label}</strong>
                <span>{t.hint}</span>
              </button>
            ))}
          </div>
          {settings.tone === "kids" && (
            <p class="note small">
              Kids mode simplifies the language and leaves out mature details, but it cannot make unsuitable material
              appropriate — pick a source that suits children, and listen together.
            </p>
          )}
        </fieldset>

        <div class="row-2">
          <label class="field">
            <span class="label">Language</span>
            <select
              value={settings.language}
              onChange={(e) => setSettings({ ...settings, language: (e.target as HTMLSelectElement).value as LangCode })}
            >
              {LANGUAGES.map((l) => (
                <option value={l.code}>{l.label}</option>
              ))}
            </select>
          </label>
          <details class="voices">
            <summary>
              <span class="label">Voices</span>
              <span class="muted small">{voices ? voices.modelLabel ?? "Default voice" : "Loading…"}</span>
            </summary>
            {voices && voices.voices.length > 0 ? (
              <div class="voice-grid">
                {(["A", "B"] as const).map((h) => (
                  <label class="field">
                    <span class="label small">
                      {lang.hosts[h]} · {h === "A" ? "curious host" : "expert"}
                    </span>
                    <select
                      value={h === "A" ? voicePrefs.voiceA : voicePrefs.voiceB}
                      onChange={(e) =>
                        setVoicePrefs({ ...voicePrefs, [h === "A" ? "voiceA" : "voiceB"]: (e.target as HTMLSelectElement).value })
                      }
                    >
                      {voices.voices.map((v) => (
                        <option value={v.id}>
                          {v.label ?? v.id}
                          {v.gender ? ` · ${v.gender}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            ) : (
              <p class="muted small">Your default Anna voice will be used for both hosts.</p>
            )}
          </details>
        </div>
      </section>

      {error && (
        <div class="alert" role="alert">
          {error}
        </div>
      )}

      <div class="submit-row">
        <button type="submit" class="btn primary big" disabled={!ready || busy}>
          {busy ? "Working…" : "Make my episode"}
        </button>
        <p class="muted small">
          Uses your Anna credits{ttsCost ? ` — about ${ttsCost} CU for voices plus the AI writing` : ""}. Takes about{" "}
          {settings.lengthMin <= 3 ? "1–2" : settings.lengthMin <= 8 ? "2–4" : "4–7"} minutes.
        </p>
      </div>
    </form>
  );
}

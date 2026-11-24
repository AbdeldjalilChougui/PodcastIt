import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { connectHost, type ConnectOutcome } from "../host/connect";
import type { HostApi } from "../host/types";
import { isCancelled, PodcastError, userMessage } from "../lib/errors";
import { viewFromDraft, viewFromRecord, type Track, type ViewEpisode } from "../lib/episode";
import { draftFromRecord, LibraryStore, type EpisodeRecord, type EpisodeSummary } from "../lib/library";
import {
  DIRECT_SOURCE_CHARS,
  generateEpisode,
  loadVoicePlan,
  voiceSegments,
  type Draft,
  type Progress,
} from "../lib/pipeline";
import { chapterTranscript, languageInfo, type EpisodeSettings, type LengthMin } from "../lib/script";
import type { SourceDoc } from "../lib/sources";
import { CreateForm, type CreateRequest, type Prefill } from "./CreateForm";
import { EpisodeView, type Banner } from "./EpisodeView";
import { IconLibrary, IconMic, Logo } from "./icons";
import { LibraryView } from "./LibraryView";
import { ProgressPanel } from "./ProgressPanel";

type Tab = "create" | "library";

interface Job {
  progress: Progress;
  condensed: boolean;
  label: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function payloadToPrefill(p: any): Prefill | undefined {
  if (!p || typeof p !== "object") return undefined;
  const url = typeof p.url === "string" ? p.url : typeof p.source_url === "string" ? p.source_url : undefined;
  const text = typeof p.text === "string" ? p.text : undefined;
  if (!url && !text) return undefined;
  return {
    url,
    text,
    lengthMin: Number(p.lengthMin ?? p.length_min ?? p.length) || undefined,
    tone: typeof p.tone === "string" ? p.tone : undefined,
    language: typeof p.language === "string" ? p.language : undefined,
    nonce: Date.now(),
  };
}

export function App() {
  const [conn, setConn] = useState<ConnectOutcome | null>(null);
  useEffect(() => {
    connectHost().then(setConn);
  }, []);

  if (!conn) {
    return (
      <div class="boot" aria-busy="true">
        <Logo size={44} />
        <p class="muted">Opening PodcastIt…</p>
      </div>
    );
  }
  if (!conn.ok) {
    return (
      <div class="boot">
        <Logo size={44} />
        <h1 class="display">PodcastIt</h1>
        <p class="muted center">{conn.message}</p>
      </div>
    );
  }
  return <Studio host={conn.host} />;
}

function Studio({ host }: { host: HostApi }) {
  const library = useMemo(() => new LibraryStore(host), [host]);
  const [tab, setTab] = useState<Tab>("create");
  const [onEpisode, setOnEpisode] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [, setVersion] = useState(0);
  const [record, setRecord] = useState<EpisodeRecord | null>(null);
  const [recordTracks, setRecordTracks] = useState<Track[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<CreateRequest | null>(null);
  const [items, setItems] = useState<EpisodeSummary[] | null>(null);
  const [libError, setLibError] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<Prefill | undefined>(() => payloadToPrefill(host.entryPayload));
  const abortRef = useRef<AbortController | null>(null);
  const urlsRef = useRef<Map<number, string>>(new Map());
  const refreshedRef = useRef(false);

  // theme follows Anna
  useEffect(() => {
    const apply = (t?: string) => {
      if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
    };
    apply(host.theme);
    return host.onThemeChange?.(({ theme }) => apply(theme));
  }, [host]);

  // Anna chat can open the window with {url | text, lengthMin, tone, language}
  useEffect(
    () =>
      host.on?.("entry_payload", (p) => {
        const pf = payloadToPrefill(p);
        if (pf && !job) {
          setPrefill(pf);
          setTab("create");
          setOnEpisode(false);
        }
      }),
    [host, job],
  );

  const refreshLibrary = useCallback(async () => {
    setLibError(null);
    try {
      setItems(await library.list());
    } catch (err) {
      setLibError(`Could not load your library. ${userMessage(err)}`);
    }
  }, [library]);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  const resetUrls = () => {
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    urlsRef.current = new Map();
  };

  const urlFor = useCallback(
    (d: Draft) => (i: number) => {
      const seg = d.segments[i];
      if (seg.status !== "ok") return null;
      if (seg.url && !seg.bytes) return seg.url;
      let u = urlsRef.current.get(i);
      if (!u && seg.bytes) {
        u = URL.createObjectURL(new Blob([seg.bytes as BlobPart], { type: seg.mime ?? "audio/mpeg" }));
        urlsRef.current.set(i, u);
      }
      return u ?? null;
    },
    [],
  );

  const bump = () => setVersion((v) => v + 1);

  async function saveDraft(d: Draft, replaceBanners = true) {
    setJob((j) => (j ? { ...j, progress: { stage: "saving", done: 0, total: 1 } } : j));
    try {
      const res = await library.save(d);
      setRecord(res.record);
      const failed = d.segments.filter((s) => s.status === "failed").length;
      const next: Banner[] = [];
      if (res.warning) next.push({ kind: "warning", text: res.warning });
      else next.push({ kind: "success", text: "Saved to your library." });
      if (failed) next.push(retryBanner(d, failed));
      setBanners(replaceBanners ? next : (b) => [...b, ...next]);
      refreshLibrary();
    } catch (err) {
      setBanners([
        {
          kind: "error",
          text: `The episode is ready but could not be saved: ${userMessage(err)}`,
          action: { label: "Save again", run: () => saveDraft(d) },
        },
      ]);
    }
  }

  function retryBanner(d: Draft, failed: number): Banner {
    return {
      kind: "warning",
      text: `${failed} short ${failed === 1 ? "clip" : "clips"} could not be voiced and will be skipped.`,
      action: { label: "Retry those clips", run: () => revoice(d) },
    };
  }

  async function revoice(d: Draft) {
    const ctl = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ctl;
    d.segments.forEach((s, i) => {
      if (s.status !== "ok") d.segments[i] = { ...s, status: "pending", error: undefined };
    });
    setDraft(d);
    setRecord(null);
    setBanners([]);
    bump();
    setJob({ progress: { stage: "voicing", done: 0, total: 1 }, condensed: false, label: d.script.title });
    try {
      await voiceSegments(
        host,
        d.segments,
        d.voices,
        d.settings.language,
        (p) => setJob((j) => (j ? { ...j, progress: p } : j)),
        () => bump(),
        ctl.signal,
      );
      await saveDraft(d);
    } catch (err) {
      setBanners([
        isCancelled(err)
          ? { kind: "info", text: "Recording paused.", action: { label: "Resume", run: () => revoice(d) } }
          : { kind: "error", text: userMessage(err), action: { label: "Try again", run: () => revoice(d) } },
      ]);
    } finally {
      setJob(null);
    }
  }

  async function runGenerate(opts: {
    settings: EpisodeSettings;
    voicePrefs?: { voiceA?: string; voiceB?: string };
    loadSource: () => Promise<SourceDoc>;
    label: string;
    focus?: Parameters<typeof generateEpisode>[1]["focus"];
    fromForm: boolean;
  }) {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    resetUrls();
    refreshedRef.current = false;
    setDraft(null);
    setRecord(null);
    setRecordTracks([]);
    setBanners([]);
    setFormError(null);
    setOnEpisode(true);
    setTab("create");
    setJob({ progress: { stage: "reading", done: 0, total: 1 }, condensed: false, label: opts.label });
    let current: Draft | null = null;
    try {
      const doc = await opts.loadSource();
      if (ctl.signal.aborted) throw new PodcastError("cancelled", "Cancelled");
      const d = await generateEpisode(host, {
        settings: opts.settings,
        doc,
        voicePrefs: opts.voicePrefs,
        focus: opts.focus,
        signal: ctl.signal,
        onProgress: (p) =>
          setJob((j) => (j ? { ...j, progress: p, condensed: j.condensed || p.stage === "condensing" } : j)),
        onScript: (dd) => {
          current = dd;
          setDraft(dd);
          host.window.set_title({ title: dd.script.title.slice(0, 120) }).catch(() => {});
        },
        onSegment: () => bump(),
      });
      await saveDraft(d);
    } catch (err) {
      if (current) {
        const d: Draft = current;
        setBanners([
          isCancelled(err) || ctl.signal.aborted
            ? { kind: "info", text: "Recording stopped. The script is ready.", action: { label: "Resume recording", run: () => revoice(d) } }
            : { kind: "error", text: userMessage(err), action: { label: "Retry recording", run: () => revoice(d) } },
        ]);
      } else if (isCancelled(err) || ctl.signal.aborted) {
        setOnEpisode(false);
      } else {
        setOnEpisode(false);
        setFormError(userMessage(err));
      }
    } finally {
      if (abortRef.current === ctl) setJob(null);
    }
  }

  function handleCreate(req: CreateRequest) {
    setLastRequest(req);
    runGenerate({
      settings: req.settings,
      voicePrefs: req.voicePrefs,
      loadSource: req.loadSource,
      label: req.sourceHint,
      fromForm: true,
    });
  }

  async function goDeeper(view: ViewEpisode, chapter: number, lengthMin: LengthMin) {
    const names = languageInfo(view.settings.language).hosts;
    const ch = view.chapters[chapter];
    const lines = view.segments.filter((s) => s.chapter === chapter).map((s) => ({ speaker: s.speaker, text: s.text }));
    const alreadyCovered = chapterTranscript({ title: ch.title, points: ch.points, lines }, names);
    const parentMaterial = draft && draft.id === view.id ? draft.material : await library.loadSource(view.id);
    const fallback = view.segments.map((s) => `${names[s.speaker]}: ${s.text}`).join("\n");
    const material = (parentMaterial || fallback).slice(0, DIRECT_SOURCE_CHARS);
    runGenerate({
      settings: { ...view.settings, lengthMin },
      loadSource: async () => ({ kind: "text", label: view.sourceLabel, title: ch.title, text: material }),
      label: `Going deeper: ${ch.title}`,
      focus: { parentId: view.id, parentTitle: view.title, chapterTitle: ch.title, points: ch.points, alreadyCovered },
      fromForm: false,
    });
  }

  async function openRecord(id: string) {
    abortRef.current?.abort();
    resetUrls();
    refreshedRef.current = false;
    setDraft(null);
    setRecord(null);
    setRecordTracks([]);
    setBanners([]);
    setOnEpisode(true);
    try {
      const r = await library.load(id);
      if (!r) {
        setOnEpisode(false);
        setLibError("That episode could not be found. It may have been deleted.");
        refreshLibrary();
        return;
      }
      setRecord(r);
      host.window.set_title({ title: r.title.slice(0, 120) }).catch(() => {});
      await loadRecordAudio(r);
    } catch (err) {
      setBanners([{ kind: "error", text: `Could not open the episode. ${userMessage(err)}`, action: { label: "Try again", run: () => openRecord(id) } }]);
    }
  }

  async function loadRecordAudio(r: EpisodeRecord) {
    if (!r.audio) {
      setBanners([
        { kind: "warning", text: "This episode has a transcript but no stored audio.", action: { label: "Voice it", run: () => voiceRecord(r) } },
      ]);
      return;
    }
    try {
      setRecordTracks(await library.resolveAudio(r));
    } catch {
      setBanners([
        {
          kind: "warning",
          text: "The stored audio is no longer available.",
          action: { label: "Voice it again", run: () => voiceRecord(r) },
        },
      ]);
    }
  }

  async function voiceRecord(r: EpisodeRecord) {
    const material = (await library.loadSource(r.id)) ?? "";
    const voices = await loadVoicePlan(host, r.settings.language, { voiceA: r.voices.voiceA, voiceB: r.voices.voiceB });
    resetUrls();
    const d = draftFromRecord(r, material, voices);
    setRecordTracks([]);
    revoice(d);
  }

  async function deleteCurrent(id: string) {
    try {
      await library.remove(id);
      setOnEpisode(false);
      setRecord(null);
      setDraft(null);
      setTab("library");
      refreshLibrary();
    } catch (err) {
      setBanners([{ kind: "error", text: `Could not delete: ${userMessage(err)}` }]);
    }
  }

  function cancelJob() {
    abortRef.current?.abort();
  }

  // ------------------------------------------------------------------ view --
  const view: ViewEpisode | null = draft
    ? viewFromDraft(draft, urlFor(draft))
    : record
      ? viewFromRecord(record, recordTracks)
      : null;

  const busy = Boolean(job);
  const showEpisode = onEpisode;

  return (
    <div class="app">
      <header class="appbar">
        <button
          type="button"
          class="brand"
          onClick={() => {
            if (!busy) {
              setOnEpisode(false);
              setTab("create");
            }
          }}
          aria-label="PodcastIt home"
        >
          <Logo size={30} />
          <span>PodcastIt</span>
        </button>
        <nav class="tabs" aria-label="Sections">
          <button
            type="button"
            class={tab === "create" && !showEpisode ? "tab on" : "tab"}
            aria-label="Create"
            aria-current={tab === "create" && !showEpisode ? "page" : undefined}
            onClick={() => {
              setTab("create");
              if (!busy) setOnEpisode(false);
            }}
          >
            <IconMic size={18} />
            <span>Create</span>
          </button>
          <button
            type="button"
            class={tab === "library" && !showEpisode ? "tab on" : "tab"}
            aria-label={items && items.length ? `Library, ${items.length} episodes` : "Library"}
            aria-current={tab === "library" && !showEpisode ? "page" : undefined}
            onClick={() => {
              setTab("library");
              if (!busy) setOnEpisode(false);
              refreshLibrary();
            }}
          >
            <IconLibrary size={18} />
            <span>Library{items && items.length ? ` · ${items.length}` : ""}</span>
          </button>
        </nav>
      </header>

      <main class="content">
        {showEpisode && !view && job && (
          <div class="working">
            <p class="eyebrow">Source</p>
            <p class="working-label clip">{job.label}</p>
            <ProgressPanel progress={job.progress} condensed={job.condensed} onCancel={cancelJob} />
          </div>
        )}

        {showEpisode && !view && !job && banners.length > 0 && (
          <div class="working">
            {banners.map((b) => (
              <div class={`banner ${b.kind}`} role="alert">
                <span>{b.text}</span>
                {b.action && (
                  <button type="button" class="btn small" onClick={b.action.run}>
                    {b.action.label}
                  </button>
                )}
              </div>
            ))}
            <button type="button" class="btn ghost" onClick={() => setOnEpisode(false)}>
              Back
            </button>
          </div>
        )}

        {showEpisode && !view && !job && !banners.length && (
          <div class="boot" aria-busy="true">
            <p class="muted">Loading episode…</p>
          </div>
        )}

        {showEpisode && view && (
          <EpisodeView
            key={view.id}
            view={view}
            busy={busy}
            banners={banners}
            backLabel={tab === "library" || (record && !draft) ? "Library" : "New episode"}
            onBack={() => {
              if (busy) cancelJob();
              setOnEpisode(false);
              if (record && !draft) setTab("library");
            }}
            onGoDeeper={(c, len) => goDeeper(view, c, len)}
            onDelete={record ? () => deleteCurrent(record.id) : undefined}
            onTrackError={
              record && !draft
                ? () => {
                    if (refreshedRef.current) return;
                    refreshedRef.current = true;
                    loadRecordAudio(record);
                  }
                : undefined
            }
          >
            {job && <ProgressPanel progress={job.progress} condensed={job.condensed} onCancel={cancelJob} />}
          </EpisodeView>
        )}

        {!showEpisode && tab === "create" && (
          <>
            {formError && (
              <div class="banner error" role="alert">
                <span>{formError}</span>
                {lastRequest && (
                  <button type="button" class="btn small" onClick={() => handleCreate(lastRequest)}>
                    Try again
                  </button>
                )}
              </div>
            )}
            <CreateForm host={host} busy={busy} prefill={prefill} onCreate={handleCreate} />
          </>
        )}

        {!showEpisode && tab === "library" && (
          <LibraryView
            items={items}
            error={libError}
            onOpen={openRecord}
            onRetry={refreshLibrary}
            onCreate={() => setTab("create")}
          />
        )}
      </main>
      {host.kind === "mock" && <p class="mock-flag">Local preview · mock Anna host (no credits used)</p>}
    </div>
  );
}

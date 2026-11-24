/**
 * Gap-light playlist player over a virtual timeline: many short clips (or a few stored parts)
 * behave like one episode with a single scrubber, speed control and chapter jumps.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Track } from "../lib/episode";
import { buildTimeline, locate } from "../lib/plan";

export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

export interface PlayerState {
  playing: boolean;
  waiting: boolean;
  time: number;
  total: number;
  rate: number;
  error: string | null;
}

export interface PlayerApi extends PlayerState {
  toggle(): void;
  play(): void;
  pause(): void;
  seek(t: number): void;
  skip(delta: number): void;
  setRate(r: number): void;
}

export function usePlayer(tracks: readonly Track[], opts: { title?: string; onTrackError?: (index: number) => void } = {}): PlayerApi {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const idxRef = useRef(0);
  const wantPlayRef = useRef(false);
  const waitingForRef = useRef<number | null>(null);
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [time, setTime] = useState(0);
  const [rate, setRateState] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const rateRef = useRef(1);

  const durations = useMemo(() => tracks.map((t) => t.duration), [tracks]);
  const timeline = useMemo(() => buildTimeline(durations), [durations]);
  const tlRef = useRef(timeline);
  tlRef.current = timeline;

  if (!audioRef.current && typeof Audio !== "undefined") {
    const el = new Audio();
    el.preload = "auto";
    audioRef.current = el;
  }

  /** Load track i at offset; returns false if nothing playable from i onwards. */
  const loadTrack = useCallback((start: number, offset: number, autoplay: boolean): boolean => {
    const el = audioRef.current;
    const list = tracksRef.current;
    if (!el) return false;
    let i = start;
    while (i < list.length && !list[i].src) {
      if (list[i].pending) {
        // wait for this clip to be voiced
        waitingForRef.current = i;
        idxRef.current = i;
        setWaiting(true);
        setTime(tlRef.current.starts[i] ?? 0);
        el.pause();
        return true;
      }
      i++;
      offset = 0;
    }
    if (i >= list.length) return false;
    waitingForRef.current = null;
    setWaiting(false);
    idxRef.current = i;
    const src = list[i].src!;
    const apply = () => {
      try {
        el.currentTime = Math.max(0, offset);
      } catch {
        /* not seekable yet */
      }
      el.playbackRate = rateRef.current;
      if (autoplay) {
        el.play().catch(() => {
          wantPlayRef.current = false;
          setPlaying(false);
        });
      }
    };
    if (el.src !== src) {
      el.src = src;
      el.defaultPlaybackRate = rateRef.current;
      if (offset > 0) el.addEventListener("loadedmetadata", apply, { once: true });
      else apply();
    } else apply();
    return true;
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => {
      const t = (tlRef.current.starts[idxRef.current] ?? 0) + el.currentTime;
      setTime(t);
    };
    const onEnded = () => {
      const next = idxRef.current + 1;
      if (!loadTrack(next, 0, true)) {
        wantPlayRef.current = false;
        setPlaying(false);
        setTime(tlRef.current.total);
        idxRef.current = 0;
      }
    };
    const onPlay = () => {
      setPlaying(true);
      setError(null);
    };
    const onPause = () => {
      if (!wantPlayRef.current) setPlaying(false);
    };
    const onError = () => {
      if (!el.getAttribute("src")) return;
      optsRef.current.onTrackError?.(idxRef.current);
      setError("This audio could not be played.");
      wantPlayRef.current = false;
      setPlaying(false);
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnded);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("error", onError);
    };
  }, [loadTrack]);

  // Resume when the clip we were waiting for has been voiced.
  useEffect(() => {
    const w = waitingForRef.current;
    if (w == null) return;
    const t = tracks[w];
    if (t && (t.src || !t.pending)) loadTrack(w, 0, wantPlayRef.current);
  }, [tracks, loadTrack]);

  // Stop and release on unmount.
  useEffect(
    () => () => {
      const el = audioRef.current;
      if (el) {
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
    },
    [],
  );

  const play = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    wantPlayRef.current = true;
    setError(null);
    const list = tracksRef.current;
    const tl = tlRef.current;
    const atEnd = time >= tl.total - 0.05;
    if (!el.getAttribute("src") || atEnd || !list[idxRef.current]?.src) {
      const { index, offset } = locate(tl, list.map((t) => t.duration), atEnd ? 0 : time);
      if (!loadTrack(index, offset, true)) wantPlayRef.current = false;
      return;
    }
    el.playbackRate = rateRef.current;
    el.play().catch(() => {
      wantPlayRef.current = false;
      setPlaying(false);
    });
  }, [loadTrack, time]);

  const pause = useCallback(() => {
    wantPlayRef.current = false;
    waitingForRef.current = null;
    setWaiting(false);
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  const seek = useCallback(
    (t: number) => {
      const list = tracksRef.current;
      const tl = tlRef.current;
      const target = Math.max(0, Math.min(t, tl.total));
      const { index, offset } = locate(tl, list.map((x) => x.duration), target);
      setTime(target);
      const el = audioRef.current;
      if (el && index === idxRef.current && el.getAttribute("src") === list[index]?.src && list[index]?.src) {
        try {
          el.currentTime = offset;
        } catch {
          /* ignore */
        }
        return;
      }
      if (wantPlayRef.current) loadTrack(index, offset, true);
      else {
        idxRef.current = index;
        if (list[index]?.src && el) {
          el.src = list[index].src!;
          el.addEventListener(
            "loadedmetadata",
            () => {
              try {
                el.currentTime = offset;
              } catch {
                /* ignore */
              }
            },
            { once: true },
          );
        }
      }
    },
    [loadTrack],
  );

  const setRate = useCallback((r: number) => {
    rateRef.current = r;
    setRateState(r);
    const el = audioRef.current;
    if (el) {
      el.playbackRate = r;
      el.defaultPlaybackRate = r;
    }
  }, []);

  const toggle = useCallback(() => (wantPlayRef.current || playing ? pause() : play()), [play, pause, playing]);
  const skip = useCallback((d: number) => seek(time + d), [seek, time]);

  // Lock-screen / headset controls where supported.
  useEffect(() => {
    const ms = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
    if (!ms) return;
    try {
      ms.metadata = new MediaMetadata({ title: opts.title ?? "PodcastIt episode", artist: "PodcastIt" });
      ms.setActionHandler("play", play);
      ms.setActionHandler("pause", pause);
      ms.setActionHandler("seekbackward", () => skip(-15));
      ms.setActionHandler("seekforward", () => skip(15));
    } catch {
      /* not supported in this container */
    }
  }, [opts.title, play, pause, skip]);

  return { playing: playing || waiting, waiting, time, total: timeline.total, rate, error, toggle, play, pause, seek, skip, setRate };
}

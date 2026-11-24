import type { HostApi } from "./types";

/** Served by the Anna host; its origin is allow-listed in every bundle's CSP. */
export const ANNA_SDK_URL = "/static/anna-apps/_sdk/latest/index.js";

/** True when the page was opened by the Anna host (window id + token in the URL). */
export function isInsideAnna(search: string = location.search): boolean {
  const p = new URLSearchParams(search);
  return p.has("wid") && p.has("t");
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function wrapAnnaRuntime(rt: any): HostApi {
  return {
    kind: "anna",
    get theme() {
      return rt.theme;
    },
    get entryPayload() {
      return rt.entryPayload;
    },
    onThemeChange: (fn) => (typeof rt.onThemeChange === "function" ? rt.onThemeChange(fn) : () => {}),
    on: (event, fn) => (typeof rt.on === "function" ? rt.on(event, fn) : () => {}),
    llm: rt.llm,
    audio: rt.audio,
    web: rt.web,
    storage: rt.storage,
    upload: rt.upload,
    window: rt.window,
  };
}

export type ConnectOutcome =
  | { ok: true; host: HostApi }
  | { ok: false; reason: "outside-anna" | "connect-failed"; message: string };

export async function connectHost(): Promise<ConnectOutcome> {
  if (import.meta.env.MODE === "mock") {
    const { createMockHost } = await import("./mock");
    return { ok: true, host: createMockHost() };
  }
  if (!isInsideAnna()) {
    return {
      ok: false,
      reason: "outside-anna",
      message: "PodcastIt runs inside Anna. Install it from the Anna App Store and open it from your dashboard.",
    };
  }
  try {
    const sdk: any = await import(/* @vite-ignore */ ANNA_SDK_URL);
    const rt = await sdk.AnnaAppRuntime.connect();
    return { ok: true, host: wrapAnnaRuntime(rt) };
  } catch (e) {
    return {
      ok: false,
      reason: "connect-failed",
      message: `Could not connect to Anna (${(e as Error)?.message ?? "unknown error"}). Close the window and open PodcastIt again.`,
    };
  }
}

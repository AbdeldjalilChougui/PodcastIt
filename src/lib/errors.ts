/** Error normalisation for host RPC failures (real SDK errors carry `code` + `details`). */

export interface NormalizedError {
  /** Stable symbolic name, e.g. APP_QUOTA_EXCEEDED, AUDIO_PROVIDER_ERROR, rate_limited. */
  name: string;
  message: string;
  retryable: boolean;
  /** Message safe to show to the user. */
  friendly: string;
  details?: unknown;
}

const NUMERIC_CODES: Record<number, string> = {
  [-32001]: "APP_NOT_GRANTED",
  [-32015]: "APP_QUOTA_EXCEEDED",
  [-32019]: "APP_MODEL_NOT_VISION_CAPABLE",
  [-32122]: "VIDEO_INVALID_REQUEST",
  [-32142]: "AUDIO_TEXT_TOO_LONG",
  [-32143]: "AUDIO_TOO_LONG",
  [-32144]: "AUDIO_PROVIDER_ERROR",
  [-32145]: "AUDIO_VOICE_INVALID",
  [-32146]: "AUDIO_MODEL_UNAVAILABLE",
  [-32147]: "AUDIO_CONTENT_REJECTED",
  [-32149]: "AUDIO_OPTION_INVALID",
};

const RETRYABLE = new Set([
  "AUDIO_PROVIDER_ERROR",
  "APP_PROVIDER_ERROR",
  "rate_limited",
  "internal_error",
  "timeout",
  "TIMEOUT",
  "invalid_token",
  "network",
]);

const FRIENDLY: Record<string, string> = {
  APP_QUOTA_EXCEEDED: "You are out of Anna credits. Top up your credits, or pick a shorter episode.",
  APP_NOT_GRANTED: "PodcastIt is disabled or your Anna plan does not cover AI calls. Check the app in your Anna dashboard.",
  AUDIO_MODEL_UNAVAILABLE: "No text-to-speech voice is available on your account right now.",
  AUDIO_CONTENT_REJECTED: "The voice service declined part of this script.",
  AUDIO_PROVIDER_ERROR: "The voice service had a hiccup.",
  APP_PROVIDER_ERROR: "The AI service had a hiccup.",
  rate_limited: "Anna is busy. Retrying in a moment.",
  timeout: "The request took too long.",
  network: "The connection to Anna dropped.",
};

function pickName(err: any): string {
  const details = err?.details ?? err?.data;
  const fromDetails = details && typeof details === "object" ? details.errorName : undefined;
  if (typeof fromDetails === "string" && fromDetails) return fromDetails;
  const code = err?.code;
  if (typeof code === "number") return NUMERIC_CODES[code] ?? `E${code}`;
  if (typeof code === "string" && code) {
    const n = Number(code);
    if (Number.isFinite(n) && NUMERIC_CODES[n]) return NUMERIC_CODES[n];
    return code;
  }
  const msg = String(err?.message ?? "");
  if (/timed out/i.test(msg)) return "timeout";
  if (/network|failed to fetch/i.test(msg)) return "network";
  return "unknown";
}

export function normalizeError(err: unknown): NormalizedError {
  const e: any = err ?? {};
  const name = pickName(e);
  const message = String(e?.message ?? e ?? "Unknown error");
  const details = e?.details ?? e?.data;
  const retryableHint = details && typeof details === "object" ? details.retryable : undefined;
  const retryable = typeof retryableHint === "boolean" ? retryableHint : RETRYABLE.has(name);
  const friendly = FRIENDLY[name] ?? (message && message !== "RPC error" ? message : "Something went wrong.");
  return { name, message, retryable, friendly, details };
}

/** An error raised by PodcastIt itself, with a user-facing message. */
export class PodcastError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "PodcastError";
  }
}

export class CancelledError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "CancelledError";
  }
}

export function isCancelled(err: unknown): boolean {
  return err instanceof CancelledError || (err as any)?.name === "CancelledError";
}

export function userMessage(err: unknown): string {
  if (err instanceof PodcastError) return err.message;
  return normalizeError(err).friendly;
}

import { describe, expect, it } from "vitest";
import { CancelledError, normalizeError, PodcastError, userMessage } from "../src/lib/errors";
import { mapPool, RETRY, withRetry } from "../src/lib/pool";
import { rpcError } from "./helpers";

RETRY.baseDelayMs = 1;

describe("normalizeError", () => {
  it("maps symbolic, numeric and details-based codes", () => {
    expect(normalizeError(rpcError("APP_QUOTA_EXCEEDED")).name).toBe("APP_QUOTA_EXCEEDED");
    expect(normalizeError(Object.assign(new Error("x"), { code: -32144 })).name).toBe("AUDIO_PROVIDER_ERROR");
    expect(normalizeError(Object.assign(new Error("x"), { code: "-32015" })).name).toBe("APP_QUOTA_EXCEEDED");
    expect(normalizeError(rpcError("internal", { errorName: "AUDIO_VOICE_INVALID" })).name).toBe("AUDIO_VOICE_INVALID");
    expect(normalizeError(new Error("RPC llm.complete timed out after 5ms")).name).toBe("timeout");
  });
  it("decides retryability (details.retryable wins)", () => {
    expect(normalizeError(rpcError("AUDIO_PROVIDER_ERROR")).retryable).toBe(true);
    expect(normalizeError(rpcError("APP_QUOTA_EXCEEDED")).retryable).toBe(false);
    expect(normalizeError(rpcError("X", { retryable: true })).retryable).toBe(true);
  });
  it("produces friendly messages", () => {
    expect(userMessage(rpcError("APP_QUOTA_EXCEEDED"))).toMatch(/out of Anna credits/);
    expect(userMessage(new PodcastError("x", "Custom message"))).toBe("Custom message");
    expect(userMessage(Object.assign(new Error("RPC error"), { code: "weird" }))).toBe("Something went wrong.");
  });
});

describe("withRetry / mapPool", () => {
  it("retries retryable errors then succeeds", async () => {
    let n = 0;
    const out = await withRetry(async () => {
      if (++n < 3) throw rpcError("rate_limited");
      return "ok";
    });
    expect(out).toBe("ok");
    expect(n).toBe(3);
  });
  it("does not retry non-retryable errors", async () => {
    let n = 0;
    await expect(
      withRetry(async () => {
        n++;
        throw rpcError("APP_QUOTA_EXCEEDED");
      }),
    ).rejects.toThrow();
    expect(n).toBe(1);
  });
  it("stops when aborted", async () => {
    const ctl = new AbortController();
    ctl.abort();
    await expect(withRetry(async () => "x", { signal: ctl.signal })).rejects.toBeInstanceOf(CancelledError);
  });
  it("mapPool keeps order and caps concurrency", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapPool([5, 1, 3, 2, 4], 2, async (x) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, x));
      inFlight--;
      return x * 10;
    });
    expect(out).toEqual([50, 10, 30, 20, 40]);
    expect(peak).toBe(2);
  });
});

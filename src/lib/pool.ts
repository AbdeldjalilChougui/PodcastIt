import { CancelledError, normalizeError } from "./errors";

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new CancelledError());
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new CancelledError());
      },
      { once: true },
    );
  });

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new CancelledError();
}

/** Global backoff base (tests lower it). */
export const RETRY = { baseDelayMs: 900 };

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  signal?: AbortSignal;
  /** Return false to stop retrying for this error. Defaults to normalizeError().retryable. */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  onRetry?: (err: unknown, attempt: number) => void;
}

/** Retry `fn` with exponential backoff on retryable errors. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const base = opts.baseDelayMs ?? RETRY.baseDelayMs;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    throwIfAborted(opts.signal);
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const retry = opts.shouldRetry ? opts.shouldRetry(err, attempt) : normalizeError(err).retryable;
      if (!retry || attempt === attempts) throw err;
      opts.onRetry?.(err, attempt);
      await sleep(base * 2 ** (attempt - 1), opts.signal);
    }
  }
  throw lastErr;
}

/** Run `worker` over `items` with at most `limit` in flight; results keep input order. */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      throwIfAborted(signal);
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

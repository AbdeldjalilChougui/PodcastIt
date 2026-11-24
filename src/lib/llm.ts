import type { HostApi, LlmCompleteResult } from "../host/types";
import { PodcastError } from "./errors";

export function resultText(res: LlmCompleteResult | null | undefined): string {
  const c = res?.content as unknown;
  if (!c) return "";
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((b) => (typeof b?.text === "string" ? b.text : "")).join("");
  if (typeof (c as { text?: unknown }).text === "string") return (c as { text: string }).text;
  return "";
}

export interface CompleteRequest {
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  tag?: string;
}

export interface CompleteOutput {
  text: string;
  truncated: boolean;
}

/** One stateless completion against the user's chosen model; empty/filtered replies throw. */
export async function complete(host: HostApi, req: CompleteRequest): Promise<CompleteOutput> {
  const res = await host.llm.complete(
    {
      systemPrompt: req.system,
      messages: [{ role: "user", content: req.user }],
      maxTokens: req.maxTokens,
      temperature: req.temperature ?? 0.8,
      thinking: false,
      metadata: req.tag ? { app: "podcastit", step: req.tag } : undefined,
    },
    { timeoutMs: 170_000 },
  );
  const text = resultText(res).trim();
  if (res?.stopReason === "contentFilter") {
    throw new PodcastError("content_filter", "The AI model declined to write about this material. Try a different source.");
  }
  if (!text) throw new PodcastError("empty_reply", "The AI returned an empty reply.", true);
  return { text, truncated: res?.stopReason === "maxTokens" };
}

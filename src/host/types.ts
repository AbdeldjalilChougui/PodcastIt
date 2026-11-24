/**
 * The subset of the Anna App runtime (AnnaAppRuntime from
 * /static/anna-apps/_sdk/latest/index.js) that PodcastIt uses.
 *
 * Every method resolves with the RPC `result` and rejects with an Error that
 * carries `code` (+ optional `details`) — the same contract as the real SDK,
 * so the mock host and the real host are interchangeable.
 */

export interface LlmMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LlmCompleteArgs {
  messages: LlmMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  thinking?: boolean;
  metadata?: Record<string, unknown>;
}

export interface LlmCompleteResult {
  role: "assistant";
  content: { type: "text"; text: string } | Array<{ type: string; text?: string }>;
  model?: string;
  stopReason?: "endTurn" | "maxTokens" | "contentFilter" | "toolUse" | string;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
}

export interface TtsVoice {
  id: string;
  label?: string;
  category?: string;
  languages?: string[];
  gender?: string;
  accent?: string;
  age?: string;
  tags?: string[];
}

export interface CatalogModel {
  modelName: string;
  displayName?: string;
  serviceTypes?: string[];
  isUserPreferred?: boolean;
  isPlatformDefault?: boolean;
  capabilities?: {
    voices?: TtsVoice[];
    defaultVoice?: string;
    maxCharsPerCall?: number;
    options?: Record<string, unknown>;
  };
  pricing?: { unit?: string; cuPer1kChars?: number };
}

export interface CatalogResult {
  models: CatalogModel[];
  quota?: { remainingCU?: number };
}

export interface SpeakArgs {
  text: string;
  voice?: string;
  model?: string;
  language?: string;
  format?: "mp3" | "wav";
  delivery?: "url" | "inline";
  speed?: number;
}

export interface SpeakResult {
  url?: string;
  audioBase64?: string;
  mimeType?: string;
  charCount?: number;
  billedCostCU?: number;
  model?: string;
  expiresIn?: number;
  durationSec?: number;
}

export interface WebFetchPage {
  url: string;
  final_url?: string;
  ok: boolean;
  title?: string;
  content?: string;
  truncated?: boolean;
  error?: string;
}

export interface UploadResult {
  r2_key: string;
  mime_type?: string;
  bytes_size?: number;
  download_url: string;
  expires_in?: number;
}

export interface StorageGetResult<T = unknown> {
  value: T | null;
  exists?: boolean;
  etag?: string;
}

export interface RpcOpts {
  timeoutMs?: number;
}

export interface HostApi {
  /** "anna" when running inside Anna, "mock" for local development. */
  readonly kind: "anna" | "mock";
  readonly theme?: "light" | "dark";
  readonly entryPayload?: unknown;
  onThemeChange?(fn: (p: { theme: "light" | "dark" }) => void): () => void;
  on?(event: string, fn: (payload: unknown) => void): () => void;

  llm: {
    complete(args: LlmCompleteArgs, opts?: RpcOpts): Promise<LlmCompleteResult>;
    catalog(args: { serviceType: string; voiceLanguage?: string }, opts?: RpcOpts): Promise<CatalogResult>;
  };
  audio: {
    speak(args: SpeakArgs, opts?: RpcOpts): Promise<SpeakResult>;
  };
  web: {
    fetch(
      args: { urls: string[]; format?: "markdown" | "text"; max_chars?: number; timeout_ms?: number },
      opts?: RpcOpts,
    ): Promise<{ pages: WebFetchPage[] }>;
  };
  storage: {
    get<T = unknown>(args: { key: string }, opts?: RpcOpts): Promise<StorageGetResult<T>>;
    set(args: { key: string; value: unknown }, opts?: RpcOpts): Promise<unknown>;
    delete(args: { key: string }, opts?: RpcOpts): Promise<unknown>;
  };
  upload: {
    inline(
      args: { filename: string; mime_type: string; content_b64: string; purpose?: string },
      opts?: RpcOpts,
    ): Promise<UploadResult>;
    confirm(args: { r2_key: string }, opts?: RpcOpts): Promise<UploadResult>;
  };
  window: {
    set_title(args: { title: string }): Promise<unknown>;
    report_error?(args: { message: string; stack?: string }): Promise<unknown>;
  };
}

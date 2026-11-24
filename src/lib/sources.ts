/** Turn a URL, an uploaded file or pasted text into clean source text. */
import type { HostApi, WebFetchPage } from "../host/types";
import { PodcastError, normalizeError } from "./errors";
import { cleanSourceText, htmlToText } from "./text";

export interface SourceDoc {
  kind: "url" | "file" | "text";
  label: string;
  title?: string;
  text: string;
}

/** Below this many characters there is not enough material for an episode. */
export const MIN_SOURCE_CHARS = 280;
/** Hard ceiling on what we read at all (very long books are sampled). */
export const MAX_SOURCE_CHARS = 400_000;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export function normalizeUrl(input: string): string {
  let s = input.trim();
  if (!s) throw new PodcastError("url_empty", "Paste a link to an article, blog post or documentation page.");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new PodcastError("url_invalid", "That does not look like a web address. Check the link and try again.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new PodcastError("url_scheme", "Only http and https links can be read.");
  }
  if (!u.hostname.includes(".")) throw new PodcastError("url_invalid", "That does not look like a public web address.");
  return u.toString();
}

export function describeFetchError(page: WebFetchPage): string {
  const e = (page.error ?? "").toUpperCase();
  if (e.includes("SSRF")) return "This address is private or blocked, so Anna cannot read it.";
  if (e.includes("TIMEOUT")) return "The page took too long to respond. Try again, or paste the text instead.";
  if (e.startsWith("HTTP_401") || e.startsWith("HTTP_403"))
    return "The site refused access (login or paywall). Copy the text and paste it instead.";
  if (e.startsWith("HTTP_404") || e.startsWith("HTTP_410")) return "That page was not found (404). Check the link.";
  if (e.startsWith("HTTP_5")) return "The site is having problems right now. Try again later.";
  if (e.includes("TOO_LARGE") || e.includes("BUDGET")) return "That page is too large to fetch. Download it as a PDF or paste the text.";
  if (e.includes("PARSE")) return "PodcastIt could not find readable text on that page. Paste the text instead.";
  return "PodcastIt could not read that page. Paste the text instead.";
}

export async function fetchUrlSource(host: HostApi, rawUrl: string): Promise<SourceDoc> {
  const url = normalizeUrl(rawUrl);
  let res;
  try {
    res = await host.web.fetch({ urls: [url], format: "markdown", max_chars: 120_000 }, { timeoutMs: 90_000 });
  } catch (err) {
    const n = normalizeError(err);
    throw new PodcastError("fetch_failed", `Could not fetch the page: ${n.friendly}`, n.retryable);
  }
  const page = res?.pages?.[0];
  if (!page || !page.ok) throw new PodcastError("fetch_failed", describeFetchError(page ?? { url, ok: false }), false);
  const text = cleanSourceText(page.content ?? "");
  if (text.length < MIN_SOURCE_CHARS) {
    throw new PodcastError(
      "fetch_empty",
      "That page has almost no readable text (it may need a login or JavaScript). Paste the text instead.",
    );
  }
  let host_ = url;
  try {
    host_ = new URL(page.final_url ?? url).hostname.replace(/^www\./, "");
  } catch {
    /* keep url */
  }
  return { kind: "url", label: host_, title: page.title?.trim() || undefined, text };
}

export function textSource(raw: string): SourceDoc {
  const text = cleanSourceText(raw);
  if (text.length < MIN_SOURCE_CHARS) {
    throw new PodcastError("text_short", `Add a bit more text — at least a few paragraphs (${MIN_SOURCE_CHARS}+ characters).`);
  }
  const firstLine = text.split("\n")[0].slice(0, 80);
  return { kind: "text", label: "Pasted text", title: firstLine, text };
}

function extOf(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

export const ACCEPTED_FILES = ".pdf,.txt,.md,.markdown,.html,.htm,.csv,.srt,.vtt";

export async function fileSource(file: File): Promise<SourceDoc> {
  if (file.size > MAX_FILE_BYTES) throw new PodcastError("file_large", "That file is larger than 25 MB. Try a smaller file.");
  const ext = extOf(file.name);
  let text: string;
  if (ext === "pdf" || file.type === "application/pdf") {
    text = await pdfToText(file);
  } else if (["txt", "md", "markdown", "csv", "srt", "vtt"].includes(ext) || file.type.startsWith("text/plain")) {
    text = await file.text();
    if (ext === "srt" || ext === "vtt") text = text.replace(/^\d+\s*$|^[\d:.,]+\s*-->\s*[\d:.,]+.*$|^WEBVTT.*$/gm, "");
  } else if (ext === "html" || ext === "htm" || file.type === "text/html") {
    text = htmlToText(await file.text());
  } else {
    throw new PodcastError("file_type", "PodcastIt reads PDF, TXT, Markdown, HTML and subtitle files.");
  }
  const clean = cleanSourceText(text);
  if (clean.length < MIN_SOURCE_CHARS) {
    throw new PodcastError(
      "file_empty",
      ext === "pdf"
        ? "This PDF has no selectable text (it may be a scan). Try a text-based PDF or paste the text."
        : "This file has too little text for an episode.",
    );
  }
  return { kind: "file", label: file.name, title: file.name.replace(/\.[^.]+$/, ""), text: clean };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function pdfToText(file: File): Promise<string> {
  let pdfjs: any;
  try {
    pdfjs = await import("pdfjs-dist/build/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("vendor/pdf.worker.min.js", document.baseURI).href;
  } catch {
    throw new PodcastError("pdf_load", "The PDF reader failed to load. Reopen PodcastIt and try again.", true);
  }
  let doc: any;
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    doc = await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false }).promise;
  } catch (e: any) {
    if (e?.name === "PasswordException") throw new PodcastError("pdf_locked", "This PDF is password-protected.");
    throw new PodcastError("pdf_bad", "This PDF could not be opened. It may be damaged.");
  }
  const pages: string[] = [];
  let total = 0;
  const maxPages = Math.min(doc.numPages, 400);
  for (let p = 1; p <= maxPages && total < MAX_SOURCE_CHARS; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let line = "";
    const lines: string[] = [];
    for (const item of content.items as any[]) {
      if (typeof item.str !== "string") continue;
      line += item.str;
      if (item.hasEOL) {
        lines.push(line);
        line = "";
      }
    }
    if (line) lines.push(line);
    const pageText = lines.join("\n").replace(/-\n(?=[a-z])/g, "");
    pages.push(pageText);
    total += pageText.length;
  }
  await doc.destroy?.();
  // join wrapped lines into paragraphs: single newlines → spaces, blank lines stay
  return pages.join("\n\n").replace(/([^\n])\n(?!\n)/g, "$1 ");
}

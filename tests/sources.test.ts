import { describe, expect, it } from "vitest";
import { describeFetchError, fetchUrlSource, normalizeUrl, textSource } from "../src/lib/sources";
import { fakeHost, rpcError } from "./helpers";

describe("sources", () => {
  it("normalizes and validates URLs", () => {
    expect(normalizeUrl("example.com/a")).toBe("https://example.com/a");
    expect(normalizeUrl(" https://x.org ")).toBe("https://x.org/");
    expect(() => normalizeUrl("")).toThrow(/Paste a link/);
    expect(() => normalizeUrl("ftp://x.org")).toThrow(/http and https/);
    expect(() => normalizeUrl("localhost")).toThrow(/public web address/);
  });

  it("explains fetch failures", () => {
    expect(describeFetchError({ url: "u", ok: false, error: "SSRF_BLOCKED" })).toMatch(/private or blocked/);
    expect(describeFetchError({ url: "u", ok: false, error: "HTTP_403" })).toMatch(/paywall/);
    expect(describeFetchError({ url: "u", ok: false, error: "HTTP_404" })).toMatch(/not found/);
    expect(describeFetchError({ url: "u", ok: false, error: "TIMEOUT" })).toMatch(/too long/);
  });

  it("fetches a page through web.fetch", async () => {
    const { host, calls } = fakeHost();
    const doc = await fetchUrlSource(host, "www.example.com/post");
    expect(doc).toMatchObject({ kind: "url", label: "example.com", title: "T" });
    expect(calls[0].args).toMatchObject({ urls: ["https://www.example.com/post"], format: "markdown" });
  });

  it("rejects unreadable pages and RPC failures with helpful messages", async () => {
    const { host } = fakeHost();
    host.web.fetch = async () => ({ pages: [{ url: "u", ok: false, error: "HTTP_404" }] });
    await expect(fetchUrlSource(host, "https://a.com")).rejects.toThrow(/not found/);
    host.web.fetch = async () => ({ pages: [{ url: "u", ok: true, content: "too short" }] });
    await expect(fetchUrlSource(host, "https://a.com")).rejects.toThrow(/almost no readable text/);
    host.web.fetch = async () => {
      throw rpcError("APP_QUOTA_EXCEEDED");
    };
    await expect(fetchUrlSource(host, "https://a.com")).rejects.toThrow(/out of Anna credits/);
  });

  it("validates pasted text", () => {
    expect(() => textSource("hi")).toThrow(/at least a few paragraphs/);
    expect(textSource("word ".repeat(100)).kind).toBe("text");
  });
});

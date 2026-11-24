// Browser walkthrough against the local mock host (`npm run dev` first).
// Usage: node scripts/browser-check.mjs [baseUrl]
// Writes screenshots to submission/screenshots/ and exits non-zero on any failed check.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:5199/";
const CHROME = process.env.CHROME_PATH ?? "/home/djalil/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome";
const OUT = "submission/screenshots";
mkdirSync(OUT, { recursive: true });

const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) failures.push(msg);
};

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});

async function newPage(viewport, { dark = false, fast = true, extra = "" } = {}) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    colorScheme: dark ? "dark" : "light",
    hasTouch: viewport.width < 500,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  const q = new URLSearchParams();
  if (fast) q.set("mockFast", "1");
  if (dark) q.set("theme", "dark");
  await page.goto(`${BASE}?${q}${extra}`);
  await page.waitForSelector(".create");
  return { page, ctx, errors };
}

async function noHorizontalScroll(page, label) {
  const { sw, cw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  check(sw <= cw + 1, `${label}: no horizontal scroll (scrollWidth ${sw} ≤ ${cw})`);
}

async function smallTargets(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("button, select, input[type=url], textarea, summary, .follow")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && style.visibility !== "hidden" && !el.closest("[hidden]");
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { label: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) };
      })
      .filter((x) => x.w < 44 || x.h < 40),
  );
}

async function makeEpisode(page, { url, length = "3 min", tone, shotProgress }) {
  await page.getByRole("tab", { name: "Link" }).click();
  await page.fill("input[type=url]", url);
  await page.getByRole("button", { name: new RegExp(length) }).click();
  if (tone) await page.getByRole("button", { name: new RegExp(tone) }).click();
  await page.getByRole("button", { name: "Make my episode" }).click();
  if (shotProgress) {
    await page.waitForSelector(".step.active:has-text('Recording the voices')", { timeout: 60_000 });
    await page.waitForFunction(() => {
      const t = document.querySelector(".step.active .small")?.textContent ?? "";
      const m = t.match(/(\d+) \/ (\d+)/);
      return m && Number(m[1]) >= 5;
    }, null, { timeout: 60_000 });
    await page.screenshot({ path: shotProgress, fullPage: false });
  }
  await page.waitForSelector(".banner.success", { timeout: 120_000 });
}

// ---------------------------------------------------------------- desktop
{
  const { page, ctx, errors } = await newPage({ width: 1280, height: 900 }, { fast: false });
  await page.screenshot({ path: `${OUT}/01-create.png` });
  check(await page.isVisible("text=Make my episode"), "desktop: create form renders");

  // error: unfetchable URL
  await page.fill("input[type=url]", "https://example.com/404-missing");
  await page.getByRole("button", { name: "Make my episode" }).click();
  await page.waitForSelector(".banner.error", { timeout: 20_000 });
  check(/not found/i.test(await page.textContent(".banner.error")), "desktop: unfetchable URL shows a friendly error");
  await page.screenshot({ path: `${OUT}/06-error.png` });

  // error: pasted text too short
  await page.getByRole("tab", { name: "Text" }).click();
  await page.fill("textarea", "Too short.");
  await page.getByRole("button", { name: "Make my episode" }).click();
  check(await page.isVisible("text=at least a few paragraphs"), "desktop: short text is rejected inline");

  // kids note
  await page.getByRole("button", { name: /Kids-friendly/ }).click();
  check(await page.isVisible("text=Kids mode simplifies"), "desktop: kids-friendly shows the suitability note");
  await page.getByRole("button", { name: /Casual/ }).click();

  // full episode with progress screenshot
  await makeEpisode(page, { url: "https://example.com/honeybees", length: "8 min", shotProgress: `${OUT}/02-progress.png` });
  check(await page.isVisible("text=Saved to your library"), "desktop: episode generated and saved");
  const chapters = await page.locator(".chapter").count();
  check(chapters === 4, `desktop: 8-min episode has 4 chapters (got ${chapters})`);
  const lines = await page.locator(".transcript .line").count();
  check(lines > 20, `desktop: transcript has ${lines} lines`);

  // playback
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(2500);
  const t1 = await page.textContent(".scrub .time");
  check(t1 !== "0:00", `desktop: playback advances (time ${t1})`);
  check((await page.locator(".line.now").count()) === 1, "desktop: current transcript line is highlighted");
  await page.getByRole("button", { name: /Playback speed/ }).click();
  check((await page.textContent(".speed")).includes("1.25"), "desktop: speed control cycles to 1.25×");
  await page.locator(".chapter-jump").nth(2).click();
  await page.waitForTimeout(600);
  check(await page.locator(".chapter").nth(2).evaluate((el) => el.classList.contains("on")), "desktop: chapter jump moves to chapter 3");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/03-episode.png` });
  await page.getByRole("button", { name: "Pause", exact: true }).click();

  // go deeper
  await page.locator(".chapter").nth(1).getByRole("button", { name: /Go deeper/ }).click();
  await page.getByRole("button", { name: /^3 min$/ }).click();
  await page.getByRole("button", { name: /Make it/ }).click();
  await page.waitForSelector(".banner.success", { timeout: 120_000 });
  check(await page.isVisible(".eyebrow:has-text('Going deeper')"), "desktop: go-deeper sequel episode generated");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/04-go-deeper.png` });

  // library
  await page.getByRole("button", { name: /Library/ }).first().click();
  await page.waitForSelector(".lib-item:not(.skeleton)");
  const items = await page.locator(".lib-item").count();
  check(items >= 2, `desktop: library lists ${items} episodes`);
  await page.screenshot({ path: `${OUT}/05-library.png` });

  // reopen from library (mock uploads are in-memory, still present in this session)
  await page.locator(".lib-item").nth(1).click();
  await page.waitForSelector(".player");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(1500);
  check((await page.textContent(".scrub .time")) !== "0:00", "desktop: stored episode plays from saved audio");
  await page.getByRole("button", { name: "Pause", exact: true }).click();

  // delete (two-step)
  await page.getByRole("button", { name: "Delete episode" }).click();
  await page.getByRole("button", { name: /Delete for good/ }).click();
  await page.waitForSelector(".lib-item:not(.skeleton)");
  check((await page.locator(".lib-item").count()) === items - 1, "desktop: delete removes the episode");

  check(errors.length === 0, `desktop: no console errors ${errors.length ? JSON.stringify(errors.slice(0, 3)) : ""}`);
  await ctx.close();
}

// ---------------------------------------------------------------- dark + quota error
{
  const { page, ctx, errors } = await newPage({ width: 1280, height: 900 }, { dark: true });
  await page.screenshot({ path: `${OUT}/07-create-dark.png` });
  await makeEpisode(page, { url: "https://example.com/honeybees", length: "3 min" });
  await page.screenshot({ path: `${OUT}/08-episode-dark.png` });
  check(errors.length === 0, "dark: no console errors");
  await ctx.close();
}
{
  const { page, ctx } = await newPage({ width: 1000, height: 800 }, { extra: "&mockFail=quota" });
  await page.fill("input[type=url]", "https://example.com/honeybees");
  await page.getByRole("button", { name: /3 min/ }).click();
  await page.getByRole("button", { name: "Make my episode" }).click();
  await page.waitForSelector(".banner.error", { timeout: 60_000 });
  const txt = await page.textContent(".banner.error");
  check(/credits/i.test(txt) && (await page.isVisible("text=Retry recording")), "quota: out-of-credits error keeps the script and offers retry");
  check((await page.locator(".transcript .line").count()) > 0, "quota: transcript still visible after TTS failure");
  await page.screenshot({ path: `${OUT}/09-quota-error.png` });
  await ctx.close();
}
{
  const { page, ctx, errors } = await newPage({ width: 1000, height: 800 }, { extra: "&mockFail=tts" });
  await makeEpisode(page, { url: "https://example.com/honeybees", length: "3 min" });
  check(!(await page.isVisible(".banner.warning")), "flaky TTS: transient failures are retried transparently");
  check(errors.length === 0, "flaky TTS: no console errors");
  await ctx.close();
}

// ---------------------------------------------------------------- mobile 390 / 320
for (const width of [390, 320]) {
  const { page, ctx, errors } = await newPage({ width, height: 844 });
  await noHorizontalScroll(page, `${width}px create`);
  if (width === 390) await page.screenshot({ path: `${OUT}/m1-create-390.png` });
  const small = await smallTargets(page);
  check(small.length === 0, `${width}px create: touch targets ≥44px ${small.length ? JSON.stringify(small) : ""}`);
  await makeEpisode(page, { url: "https://example.com/honeybees", length: "3 min" });
  await noHorizontalScroll(page, `${width}px episode`);
  const smallEp = await smallTargets(page);
  check(smallEp.length === 0, `${width}px episode: touch targets ≥44px ${smallEp.length ? JSON.stringify(smallEp) : ""}`);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo(0, 0));
  if (width === 390) {
    await page.screenshot({ path: `${OUT}/m2-episode-390.png` });
    await page.screenshot({ path: `${OUT}/m3-episode-390-full.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: /Library/ }).first().click();
  await page.waitForSelector(".lib-item:not(.skeleton)");
  await noHorizontalScroll(page, `${width}px library`);
  if (width === 390) await page.screenshot({ path: `${OUT}/m4-library-390.png` });
  check(errors.length === 0, `${width}px: no console errors`);
  await ctx.close();
}

// ---------------------------------------------------------------- Arabic RTL
{
  const { page, ctx } = await newPage({ width: 1000, height: 900 });
  await page.selectOption("select", "ar");
  await makeEpisode(page, { url: "https://example.com/honeybees", length: "3 min" });
  check((await page.getAttribute(".transcript", "dir")) === "rtl", "arabic: transcript renders right-to-left");
  check(await page.isVisible(".who:has-text('ليلى')"), "arabic: Arabic host names shown");
  await ctx.close();
}

await browser.close();
console.log(failures.length ? `\n${failures.length} check(s) FAILED` : "\nAll browser checks passed");
process.exit(failures.length ? 1 : 0);

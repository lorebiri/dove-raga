#!/usr/bin/env node
// Genera gli screenshot delle direzioni grafiche in docs/stili/<direzione>/screenshot/
// e la tavola riassuntiva docs/stili/tavola-<direzione>.png.
// Uso: node scripts/stili.mjs [a-capsula b-sticker c-y2k]
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STILI = join(ROOT, "docs", "stili");
const PORT = 4198;
const BASE = `http://localhost:${PORT}/dove-raga/`;
const DIRS = process.argv.slice(2).length ? process.argv.slice(2) : ["b-sticker"];
const PHONE = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "it-IT" };

const server = spawn(process.execPath, [join(ROOT, "scripts", "serve.mjs")], { env: { ...process.env, PORT: String(PORT), SITE_DIR: "docs/stili" }, stdio: "ignore" });
await new Promise(r => setTimeout(r, 600));
const browser = await chromium.launch();
const ready = page => page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); });

try {
  for (const d of DIRS) {
    const out = join(STILI, d, "screenshot");
    await mkdir(out, { recursive: true });
    console.log(d);

    const phone = await browser.newContext({ ...PHONE, reducedMotion: "no-preference" });
    const p = await phone.newPage();
    await p.goto(BASE + d + "/");
    await ready(p);
    await p.waitForTimeout(700);
    await p.screenshot({ path: join(out, "01-principale.png") });
    await p.goto(BASE + d + "/#risultato");
    await p.reload();
    await ready(p);
    await p.waitForTimeout(1400);
    await p.screenshot({ path: join(out, "02-risultato.png") });
    await phone.close();

    const big = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
    const c = await big.newPage();
    await c.goto(BASE + d + "/cartolina.html");
    await ready(c);
    await c.screenshot({ path: join(out, "03-cartolina.png") });
    await big.close();

    const m = await browser.newContext({ viewport: { width: 1800, height: 1400 }, deviceScaleFactor: 2 });
    const mp = await m.newPage();
    await mp.goto(BASE + "marchio.html?d=" + d);
    await ready(mp);
    await mp.locator("#logo").screenshot({ path: join(out, "logo.png") });
    await mp.locator("#simbolo").screenshot({ path: join(out, "simbolo.png"), omitBackground: true });
    await mp.locator("#home").screenshot({ path: join(out, "home.png") });
    await mp.locator("#avatar").screenshot({ path: join(out, "avatar.png") });
    await m.close();
    const m1 = await browser.newContext({ viewport: { width: 1800, height: 1400 }, deviceScaleFactor: 1 });
    const mp1 = await m1.newPage();
    await mp1.goto(BASE + "marchio.html?d=" + d);
    await ready(mp1);
    await mp1.locator("#icona").screenshot({ path: join(out, "icona-512.png") });
    await mp1.locator("#maskable").screenshot({ path: join(out, "icona-maskable-512.png") });
    await m1.close();

    const t = await browser.newContext({ viewport: { width: 1800, height: 1000 }, deviceScaleFactor: 1 });
    const tp = await t.newPage();
    await tp.goto(BASE + "tavola.html?d=" + d);
    await ready(tp);
    await tp.screenshot({ path: join(STILI, `tavola-${d}.png`), fullPage: true });
    await t.close();
  }
} finally {
  await browser.close();
  server.kill();
}

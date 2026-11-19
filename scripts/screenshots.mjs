#!/usr/bin/env node
// Collaudo visivo: avvia il server locale e fotografa i passaggi principali su un telefono.
// Usa i dati veri di app/data se ci sono, altrimenti quelli di prova dei test.
// Uso: npm run screenshots  →  docs/screenshot/*.png
import { chromium, devices } from "@playwright/test";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { useFixtureData } from "../test/e2e/helpers.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "screenshot");
const PORT = 4199;
const BASE = `http://localhost:${PORT}/dove-raga/`;
const real = existsSync(join(ROOT, "app", "data", "index.json")) && existsSync(join(ROOT, "app", "data", "comuni.json"));
const CITY = process.env.CITY || "Bologna";
const GEO = { latitude: 45.4642, longitude: 9.19 }; // Milano, piazza Duomo

await mkdir(OUT, { recursive: true });
const server = spawn(process.execPath, [join(ROOT, "scripts", "serve.mjs")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
await new Promise(r => setTimeout(r, 600));

const browser = await chromium.launch();
const phone = { ...devices["Pixel 7"], deviceScaleFactor: 2 };
const shot = async (page, name) => { await page.screenshot({ path: join(OUT, name) }); console.log("  ", name); };

async function session(scheme, fn) {
  const ctx = await browser.newContext({ ...phone, colorScheme: scheme, locale: "it-IT", geolocation: GEO, permissions: ["geolocation", "clipboard-read", "clipboard-write"], serviceWorkers: "block" });
  const page = await ctx.newPage();
  if (!real) await useFixtureData(page);
  await page.addInitScript(() => { delete Navigator.prototype.share; delete Navigator.prototype.canShare; });
  try { await fn(page, ctx); } finally { await ctx.close(); }
}

console.log(`dati: ${real ? "veri (app/data)" : "di prova (test/fixtures)"}`);
try {
  await session("light", async page => {
    await page.goto(BASE);
    await page.evaluate(() => document.fonts.ready);
    await shot(page, "01-home.png");
    await page.getByRole("button", { name: "Usa la mia posizione" }).click();
    await page.getByRole("button", { name: "Tira il dado" }).waitFor({ state: "visible" });
    await page.waitForFunction(() => !document.getElementById("stage").disabled);
    await shot(page, "02-locali-trovati.png");
    await page.getByRole("button", { name: "Tira il dado" }).click();
    await page.waitForTimeout(500);
    await shot(page, "03-dado-che-rotola.png");
    await page.locator("#placeName").waitFor();
    await page.waitForTimeout(900);
    await page.locator("#result").scrollIntoViewIfNeeded();
    await shot(page, "04-risultato.png");

    // cartolina 9:16
    const dl = page.waitForEvent("download");
    await page.getByRole("button", { name: "Sticker per le storie" }).click();
    const file = await (await dl).path();
    const { readFile } = await import("node:fs/promises");
    await writeFile(join(OUT, "05-cartolina-9x16.png"), await readFile(file));
    console.log("   05-cartolina-9x16.png");

    // link di gruppo aperto da un amico
    await page.getByRole("button", { name: "Manda al gruppo" }).click();
    await page.locator("#toast").waitFor();
    await shot(page, "06-link-copiato.png");
    const url = await page.evaluate(() => navigator.clipboard.readText());
    const friend = await page.context().newPage();
    if (!real) await useFixtureData(friend);
    await friend.goto(url);
    await friend.locator("#placeName").waitFor();
    await friend.waitForTimeout(600);
    await shot(friend, "07-gruppo-stesso-esito.png");
  });

  await session("light", async page => {
    await page.goto(BASE);
    const box = page.getByRole("combobox", { name: "Città o comune" });
    await box.fill(real ? CITY.slice(0, 4) : "mil");
    await page.getByRole("option").first().waitFor();
    await box.press("ArrowDown");
    await shot(page, "08-suggerimenti-citta.png");
    await box.press("Enter");
    await page.waitForFunction(() => /posti? entro/.test(document.getElementById("status").textContent));
    await page.locator("#listBox summary").click();
    await page.locator("#listBox").scrollIntoViewIfNeeded();
    await shot(page, "09-elenco-ed-esclusioni.png");
  });
} finally {
  await browser.close();
  server.kill();
}

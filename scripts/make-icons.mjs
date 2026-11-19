#!/usr/bin/env node
// Genera le icone PNG da app/icon.svg (strumento di sviluppo, serve Playwright).
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const jobs = [
  ["app/icon.svg", "app/icon-180.png", 180],
  ["app/icon.svg", "app/icon-192.png", 192],
  ["app/icon.svg", "app/icon-512.png", 512],
  ["scripts/icon-maskable.svg", "app/icon-maskable-512.png", 512],
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [src, out, size] of jobs) {
  const svg = await readFile(join(ROOT, src), "utf8");
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: join(ROOT, out), omitBackground: false });
  console.log("scritto", out);
}
await browser.close();

#!/usr/bin/env node
// Scarica da Overpass (OpenStreetMap) i locali sushi/giapponesi d'Italia e l'elenco dei comuni,
// e scrive i file statici in app/data/. Pensato per girare in GitHub Actions una volta a settimana.
//
// Rispetto delle regole d'uso di Overpass: una sola richiesta per insieme di dati, in sequenza,
// con pausa tra le due; un mirror di riserva solo se il primo fallisce; User-Agent descrittivo
// senza dati personali.
//
// Uso: node scripts/fetch-data.mjs [--only places|comuni]
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PLACES_QUERY, COMUNI_QUERY, buildPlaces, buildComuni } from "./lib/osm.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "app", "data");
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const UA = "DoveRaga-data/1.0 (weekly static export; +https://github.com/lorebiri/dove-raga)";
// Soglie minime: sotto, il risultato è probabilmente incompleto e si tiene la copia precedente.
const MIN_PLACES = Number(process.env.MIN_PLACES ?? 500);
const MIN_COMUNI = Number(process.env.MIN_COMUNI ?? 7000);

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function overpass(query) {
  const errors = [];
  for (const url of ENDPOINTS) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 20 * 60 * 1000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
        signal: ctl.signal,
      }).finally(() => clearTimeout(timer));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.remark && /error|timed out|runtime/i.test(json.remark)) throw new Error(json.remark);
      return json;
    } catch (e) {
      errors.push(`${new URL(url).host}: ${e.message}`);
      console.warn(`[dati] ${url} non riuscito: ${e.message}`);
      await sleep(60_000);
    }
  }
  throw new Error("Overpass non disponibile: " + errors.join("; "));
}

const writeJson = (file, obj) => writeFile(file, JSON.stringify(obj) + "\n");

async function places() {
  console.log("[dati] scarico i locali…");
  const { index, tiles } = buildPlaces(await overpass(PLACES_QUERY));
  if (index.count < MIN_PLACES) throw new Error(`solo ${index.count} locali (minimo ${MIN_PLACES}): tengo i dati precedenti`);
  const dir = join(OUT, "places");
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (const [k, t] of Object.entries(tiles)) await writeJson(join(dir, `${k}.json`), t);
  await writeJson(join(OUT, "index.json"), index);
  console.log(`[dati] ${index.count} locali in ${Object.keys(tiles).length} riquadri`);
}

async function comuni() {
  console.log("[dati] scarico i comuni…");
  const data = buildComuni(await overpass(COMUNI_QUERY));
  if (data.c.length < MIN_COMUNI) throw new Error(`solo ${data.c.length} comuni (minimo ${MIN_COMUNI}): tengo i dati precedenti`);
  await writeJson(join(OUT, "comuni.json"), data);
  console.log(`[dati] ${data.c.length} comuni`);
}

const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : "";
await mkdir(OUT, { recursive: true });
let failed = false;
if (!only || only === "places") await places().catch(e => { console.error("[dati] locali:", e.message); failed = true; });
if (!only) await sleep(15_000);
if (!only || only === "comuni") await comuni().catch(e => { console.error("[dati] comuni:", e.message); failed = true; });
// Il file di licenza accompagna sempre i dati.
await writeFile(join(OUT, "LICENSE.txt"), await readFile(join(ROOT, "scripts", "DATA-LICENSE.txt")));
process.exit(failed ? 1 : 0);

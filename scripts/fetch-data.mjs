#!/usr/bin/env node
// Scarica da Overpass (OpenStreetMap) i locali sushi/giapponesi d'Italia e l'elenco dei comuni,
// e scrive i file statici in app/data/. Pensato per girare in GitHub Actions una volta a settimana.
//
// Rispetto delle regole d'uso di Overpass:
// - l'Italia è divisa in zone da 2°: richieste piccole, una alla volta, con una pausa tra l'una e l'altra;
// - se una zona fallisce si riprova più tardi (attesa crescente) e su un altro server;
//   se continua a fallire si divide in 4 zone più piccole (fino a 0,5°);
// - ogni zona arrivata resta in una cache su disco (OVERPASS_CACHE, valida CACHE_DAYS giorni):
//   se lo scaricamento si interrompe, il giro dopo riparte dalle zone mancanti;
// - User-Agent descrittivo, senza dati personali.
// I file vengono sostituiti solo se TUTTE le zone sono arrivate e il totale è credibile.
//
// Uso: node scripts/fetch-data.mjs [--only places|comuni]
import { mkdir, writeFile, rm, readFile, rename, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { zones, splitZone, checkArea, placesQuery, comuniQuery, PROVINCE_QUERY, mergeResponses, plausible, buildPlaces, buildComuni } from "./lib/osm.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "app", "data");
const ENDPOINTS = (process.env.OVERPASS_URLS || [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
].join(",")).split(",");
const UA = "DoveRaga-data/1.0 (weekly static export; +https://github.com/lorebiri/dove-raga)";
const PAUSE_MS = Number(process.env.PAUSE_MS ?? 4000);
const ATTEMPTS = 2;          // tentativi per zona prima di dividerla
const MIN_ZONE_DEG = 0.5;    // sotto questa misura non si divide più: si riprova e basta
const LAST_ATTEMPTS = 4;
const CACHE = process.env.OVERPASS_CACHE || join(ROOT, ".cache", "overpass");
const CACHE_DAYS = Number(process.env.CACHE_DAYS ?? 6);
const MIN_PLACES = Number(process.env.MIN_PLACES ?? 500);
const MIN_COMUNI = Number(process.env.MIN_COMUNI ?? 7500);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const why = e => [e.message, e.cause?.code, e.cause?.message].filter(Boolean).join(" / ");

async function post(url, query) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6 * 60 * 1000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "User-Agent": UA, "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: query }),
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.remark && /error|timed out|runtime|out of memory/i.test(json.remark)) throw new Error(json.remark.slice(0, 160));
    return checkArea(json);
  } finally {
    clearTimeout(timer);
  }
}

// Server che ha risposto bene per ultimo: si riparte da lì.
let preferred = 0;
async function overpass(query, label, attempts = LAST_ATTEMPTS) {
  let lastErr;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const i = (preferred + attempt) % ENDPOINTS.length;
    const url = ENDPOINTS[i];
    try {
      const json = await post(url, query);
      preferred = i;
      return json;
    } catch (e) {
      lastErr = e;
      const wait = 15_000 * 2 ** attempt;
      console.warn(`[dati] ${label}: ${new URL(url).host} non riuscito (${why(e)}), riprovo tra ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  throw new Error(`${label}: ${why(lastErr)}`);
}

// Cache delle zone: un file per tipo e zona, valido CACHE_DAYS giorni.
// "v2": le zone salvate prima del controllo dell'area non sono affidabili.
const cacheFile = (kind, z) => join(CACHE, `v2_${kind}_${z.join("_")}.json`);
async function fromCache(kind, z) {
  const f = cacheFile(kind, z);
  try {
    if ((Date.now() - (await stat(f)).mtimeMs) / 864e5 > CACHE_DAYS) return null;
    const json = JSON.parse(await readFile(f, "utf8"));
    return Array.isArray(json.elements) ? json : null;
  } catch { return null; }
}
async function toCache(kind, z, json) {
  await mkdir(CACHE, { recursive: true });
  await writeFile(cacheFile(kind, z), JSON.stringify({ elements: json.elements }));
}

// Una zona: dalla cache, oppure da Overpass; se non arriva e si può, la divide in 4.
async function zone(kind, build, z, label) {
  const cached = await fromCache(kind, z);
  if (cached) { console.log(`[dati] ${label}: ${cached.elements.length} elementi (cache)`); return [cached]; }
  const small = z[2] - z[0] <= MIN_ZONE_DEG || z[3] - z[1] <= MIN_ZONE_DEG;
  try {
    const json = await overpass(build(z), `${label} [${z}]`, small ? LAST_ATTEMPTS : ATTEMPTS);
    await toCache(kind, z, json);
    console.log(`[dati] ${label}: ${json.elements.length} elementi`);
    await sleep(PAUSE_MS);
    return [json];
  } catch (e) {
    if (small) throw e;
    console.warn(`[dati] ${label}: la divido in 4 zone più piccole`);
    const out = [];
    for (const [i, q] of splitZone(z).entries()) out.push(...await zone(kind, build, q, `${label}.${i + 1}`));
    return out;
  }
}

async function byZones(kind, build) {
  const zs = zones();
  const responses = [];
  for (const [n, z] of zs.entries()) responses.push(...await zone(kind, build, z, `${kind} zona ${n + 1}/${zs.length}`));
  return mergeResponses(responses);
}

const readJson = async f => (existsSync(f) ? JSON.parse(await readFile(f, "utf8")) : null);
const writeJson = (file, obj) => writeFile(file, JSON.stringify(obj) + "\n");

async function places() {
  console.log("[dati] scarico i locali…");
  const { index, tiles } = buildPlaces(await byZones("locali", placesQuery));
  const prev = await readJson(join(OUT, "index.json"));
  const bad = plausible(index.count, { min: MIN_PLACES, previous: prev?.count, maxDrop: 0.2 });
  if (bad) throw new Error(`locali non credibili: ${bad}. Tengo i dati precedenti.`);
  // Scrive in una cartella nuova e poi la scambia: niente stati a metà.
  const dir = join(OUT, "places"), tmp = join(OUT, "places.new");
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  for (const [k, t] of Object.entries(tiles)) await writeJson(join(tmp, `${k}.json`), t);
  await rm(dir, { recursive: true, force: true });
  await rename(tmp, dir);
  await writeJson(join(OUT, "index.json"), index);
  console.log(`[dati] ${index.count} locali in ${Object.keys(tiles).length} riquadri`);
}

async function comuni() {
  console.log("[dati] scarico province e comuni…");
  const prov = await overpass(PROVINCE_QUERY, "province");
  await sleep(PAUSE_MS);
  const com = await byZones("comuni", comuniQuery);
  const data = buildComuni(mergeResponses([prov, com]));
  const prev = await readJson(join(OUT, "comuni.json"));
  const bad = plausible(data.c.length, { min: MIN_COMUNI, previous: prev?.c?.length, maxDrop: 0.05 });
  if (bad) throw new Error(`comuni non credibili: ${bad}. Tengo i dati precedenti.`);
  await writeJson(join(OUT, "comuni.json"), data);
  const withProv = data.c.filter(r => r[3]).length;
  console.log(`[dati] ${data.c.length} comuni (${withProv} con sigla di provincia)`);
}

const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : "";
await mkdir(OUT, { recursive: true });
let failed = false;
if (!only || only === "places") await places().catch(e => { console.error("[dati] ERRORE", e.message); failed = true; });
if (!only || only === "comuni") await comuni().catch(e => { console.error("[dati] ERRORE", e.message); failed = true; });
// Il file di licenza accompagna sempre i dati.
await writeFile(join(OUT, "LICENSE.txt"), await readFile(join(ROOT, "scripts", "DATA-LICENSE.txt")));
process.exit(failed ? 1 : 0);

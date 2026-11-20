#!/usr/bin/env node
// Genera i file statici di app/data/ (locali sushi/giapponesi e comuni d'Italia) dall'estratto
// OpenStreetMap dell'Italia pubblicato ogni giorno da Geofabrik. Pensato per GitHub Actions.
//
// Perché non Overpass: i server pubblici di Overpass da GitHub Actions rispondono a fatica
// (rifiuti, 502/504, aree mancanti che danno zone vuote). L'estratto è UN file scaricato
// una volta a settimana, verificato con la sua impronta MD5, e filtrato in locale con osmium.
//
// Passi: scarica (con nuovi tentativi) → controlla l'MD5 → osmium tags-filter → osmium export
// (GeoJSON riga per riga) → tiene solo ciò che sta dentro il confine italiano → controlla che i
// totali siano credibili → sostituisce i file in un colpo solo.
//
// Uso: node scripts/fetch-data.mjs [--pbf file.osm.pbf]   (richiede osmium-tool e curl)
// Variabili: PBF_URL, MIN_PLACES, MIN_COMUNI, WORK_DIR, OUT_DIR.
import { mkdir, writeFile, rm, readFile, rename } from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { plausible, buildPlaces, buildComuni } from "./lib/osm.mjs";
import { toElement, prepareArea, inArea, isItaly, isPlace, isAdmin } from "./lib/pbf.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.OUT_DIR || join(ROOT, "app", "data");
const WORK = process.env.WORK_DIR || join(ROOT, ".cache", "osm");
const PBF_URL = process.env.PBF_URL || "https://download.geofabrik.de/europe/italy-latest.osm.pbf";
const UA = "DoveRaga-data/1.0 (weekly static export; +https://github.com/lorebiri/dove-raga)";
const MIN_PLACES = Number(process.env.MIN_PLACES ?? 500);
const MIN_COMUNI = Number(process.env.MIN_COMUNI ?? 7500);

const log = (...a) => console.log("[dati]", ...a);
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ["ignore", "inherit", "inherit"] });

async function md5(file) {
  const h = createHash("md5");
  for await (const chunk of createReadStream(file)) h.update(chunk);
  return h.digest("hex");
}

/** Scarica l'estratto e lo verifica con il file .md5 accanto. Riprova fino a 3 volte. */
async function download() {
  const file = join(WORK, "italy.osm.pbf");
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      log(`scarico ${PBF_URL} (tentativo ${attempt})…`);
      run("curl", ["-fsSL", "--retry", "5", "--retry-delay", "30", "--retry-all-errors", "-A", UA, "-o", file, PBF_URL]);
      const expected = execFileSync("curl", ["-fsSL", "--retry", "5", "-A", UA, PBF_URL + ".md5"], { encoding: "utf8" }).trim().split(/\s+/)[0];
      const got = await md5(file);
      if (expected !== got) throw new Error(`MD5 diverso (atteso ${expected}, ottenuto ${got})`);
      log("estratto scaricato e verificato");
      return file;
    } catch (e) {
      console.warn(`[dati] scaricamento non riuscito: ${e.message}`);
      if (attempt < 3) await new Promise(r => setTimeout(r, 60_000 * attempt));
    }
  }
  throw new Error("estratto OSM non scaricato");
}

/** osmium: tiene solo locali e confini amministrativi, poi esporta in GeoJSON (una riga per oggetto). */
function extract(pbf) {
  const filtered = join(WORK, "filtered.osm.pbf"), geo = join(WORK, "data.geojsonseq");
  log("filtro con osmium…");
  run("osmium", ["tags-filter", "--overwrite", "-o", filtered, pbf,
    "nwr/amenity=restaurant,fast_food", "r/admin_level=2,6,8"]);
  run("osmium", ["export", "--overwrite", "-o", geo, "-f", "geojsonseq",
    "--format-option", "print_record_separator=false",
    "--add-unique-id", "type_id", "--geometry-types", "point,polygon", filtered]);
  return geo;
}

/** Legge l'export riga per riga: niente file enormi in memoria, solo i baricentri. */
async function read(geo) {
  const places = [], admin = [];
  let italy = null;
  const lines = createInterface({ input: createReadStream(geo), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const f = JSON.parse(line.replace(/^\x1e/, ""));
    const t = f.properties || {};
    if (isItaly(f)) { italy = prepareArea(f.geometry); continue; }
    if (isPlace(t)) { const el = toElement(f); if (el) places.push(el); continue; }
    if (isAdmin(t)) { const el = toElement(f); if (el) admin.push(el); }
  }
  if (!italy?.length) throw new Error("confine dell'Italia non trovato nell'estratto");
  const inItaly = el => inArea(italy, el.center.lat, el.center.lon);
  return { places: places.filter(inItaly), admin: admin.filter(inItaly), outside: places.length - places.filter(inItaly).length };
}

const readJson = async f => (existsSync(f) ? JSON.parse(await readFile(f, "utf8")) : null);
const writeJson = (file, obj) => writeFile(file, JSON.stringify(obj) + "\n");

async function savePlaces(elements) {
  const { index, tiles } = buildPlaces({ elements });
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
  log(`${index.count} locali in ${Object.keys(tiles).length} riquadri`);
}

async function saveComuni(elements) {
  const data = buildComuni({ elements });
  const prev = await readJson(join(OUT, "comuni.json"));
  const bad = plausible(data.c.length, { min: MIN_COMUNI, previous: prev?.c?.length, maxDrop: 0.05 });
  if (bad) throw new Error(`comuni non credibili: ${bad}. Tengo i dati precedenti.`);
  await writeJson(join(OUT, "comuni.json"), data);
  log(`${data.c.length} comuni (${data.c.filter(r => r[3]).length} con sigla di provincia)`);
}

const arg = name => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : "");
await mkdir(OUT, { recursive: true });
await mkdir(WORK, { recursive: true });
let failed = false;
try {
  const pbf = arg("--pbf") || await download();
  const { places, admin, outside } = await read(extract(pbf));
  log(`trovati ${places.length} locali in Italia (${outside} fuori confine scartati), ${admin.length} confini di province e comuni`);
  await savePlaces(places).catch(e => { console.error("[dati] ERRORE", e.message); failed = true; });
  await saveComuni(admin).catch(e => { console.error("[dati] ERRORE", e.message); failed = true; });
} catch (e) {
  console.error("[dati] ERRORE", e.message);
  failed = true;
}
// Il file di licenza accompagna sempre i dati.
await writeFile(join(OUT, "LICENSE.txt"), await readFile(join(ROOT, "scripts", "DATA-LICENSE.txt")));
process.exit(failed ? 1 : 0);

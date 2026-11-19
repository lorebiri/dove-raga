// Trasforma le risposte di Overpass nei file statici compatti dell'app.
// Funzioni pure: niente rete, niente file. Testate in test/osm.test.mjs.

export const TILE_DEG = 1; // deve coincidere con app/js/geo.js

export const PLACES_QUERY = `[out:json][timeout:900];
area["ISO3166-1"="IT"]["admin_level"="2"]->.it;
nwr(area.it)["amenity"~"^(restaurant|fast_food)$"]["cuisine"~"sushi|japanese",i];
out center tags;`;

export const COMUNI_QUERY = `[out:json][timeout:900][maxsize:2000000000];
area["ISO3166-1"="IT"]["admin_level"="2"]->.it;
rel(area.it)["boundary"="administrative"]["admin_level"="6"];
out tags;
rel(area.it)["boundary"="administrative"]["admin_level"="8"];
out tags center;`;

const r5 = x => Math.round(x * 1e5) / 1e5;
const clean = s => String(s ?? "").replace(/\s+/g, " ").trim();
const httpUrl = s => {
  s = clean(s).split(/\s*;\s*/)[0];
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try { const u = new URL(s); return /^https?:$/.test(u.protocol) && u.hostname.includes(".") ? u.href : ""; } catch { return ""; }
};

function coords(el) {
  const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
  return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
}

/** Un elemento OSM → riga compatta [key, nome, lat, lon, flags, indirizzo, orari, telefono, sito]. */
export function placeRow(el) {
  const t = el.tags || {};
  const name = clean(t.name);
  const c = coords(el);
  if (!name || !c) return null;
  if (!/^(restaurant|fast_food)$/.test(t.amenity || "")) return null;
  if (!/sushi|japanese/i.test(t.cuisine || "")) return null;
  const street = clean(t["addr:street"] || t["addr:place"]);
  const addr = [street && (street + (t["addr:housenumber"] ? " " + clean(t["addr:housenumber"]) : "")), clean(t["addr:city"])]
    .filter(Boolean).join(", ");
  const flags = (/sushi/i.test(t.cuisine) ? 1 : 0) | (/^(yes|only)$/.test(t.takeaway || "") ? 2 : 0);
  const phone = clean(t.phone || t["contact:phone"]).split(/\s*;\s*/)[0];
  const row = [el.type[0] + el.id, name.slice(0, 120), r5(c[0]), r5(c[1]), flags, addr.slice(0, 160),
    clean(t.opening_hours).slice(0, 200), phone.slice(0, 40), httpUrl(t.website || t["contact:website"]).slice(0, 200)];
  while (row.length > 5 && row[row.length - 1] === "") row.pop();
  return row;
}

export function tileOf(lat, lon) {
  return `${Math.floor(lat / TILE_DEG) * TILE_DEG}_${Math.floor(lon / TILE_DEG) * TILE_DEG}`;
}

/** Risposta Overpass dei locali → { index, tiles: { chiave: {v, p} } }. */
export function buildPlaces(json, generated = new Date().toISOString()) {
  const seen = new Set();
  const rows = [];
  for (const el of json?.elements || []) {
    const row = placeRow(el);
    if (!row) continue;
    const dup = row[1].toLowerCase() + "|" + Math.round(row[2] * 1e3) + "|" + Math.round(row[3] * 1e3);
    if (seen.has(dup)) continue;
    seen.add(dup);
    rows.push(row);
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  const tiles = {};
  for (const row of rows) (tiles[tileOf(row[2], row[3])] ??= { v: 1, p: [] }).p.push(row);
  const counts = Object.fromEntries(Object.keys(tiles).sort().map(k => [k, tiles[k].p.length]));
  return { index: { v: 1, generated, count: rows.length, tileDeg: TILE_DEG, tiles: counts }, tiles };
}

/** Risposta Overpass dei comuni → { v, generated, c: [[nome, lat, lon, sigla, abitanti]] }. */
export function buildComuni(json, generated = new Date().toISOString()) {
  const els = json?.elements || [];
  const prov = new Map();
  for (const el of els) {
    const t = el.tags || {};
    if (t.admin_level !== "6") continue;
    const code = clean(t["ref:ISTAT"]).padStart(3, "0");
    const sigla = clean(t.ref || t.short_name).toUpperCase();
    if (/^\d{3}$/.test(code) && /^[A-Z]{2}$/.test(sigla)) prov.set(code, sigla);
  }
  const out = [];
  const seen = new Set();
  for (const el of els) {
    const t = el.tags || {};
    if (t.admin_level !== "8") continue;
    const name = clean(t["name:it"] || t.name);
    const c = coords(el);
    if (!name || !c) continue;
    const istat = clean(t["ref:ISTAT"]);
    const sigla = /^\d{6}$/.test(istat) ? prov.get(istat.slice(0, 3)) || "" : "";
    const id = name + "|" + sigla;
    if (seen.has(id)) continue;
    seen.add(id);
    const pop = parseInt(String(t.population || "").replace(/[^\d]/g, ""), 10) || 0;
    out.push([name, r5(c[0]), r5(c[1]), sigla, pop]);
  }
  out.sort((a, b) => b[4] - a[4] || a[0].localeCompare(b[0], "it"));
  return { v: 1, generated, c: out };
}

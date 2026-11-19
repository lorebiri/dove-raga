// Lettura dei dati statici generati dal workflow (app/data/).
import { distKm, tilesForCircle } from "./geo.js";

export const FLAG_SUSHI = 1;
export const FLAG_TAKEAWAY = 2;

/** Converte una riga compatta di un tile in un oggetto locale. */
export function decodePlace(row) {
  if (!Array.isArray(row) || row.length < 4) return null;
  const [key, n, lat, lon, flags = 0, a = "", h = "", t = "", w = ""] = row;
  if (typeof key !== "string" || typeof n !== "string" || !n.trim()) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    key, n, lat, lon, a, h, t, w,
    sushi: (flags & FLAG_SUSHI) !== 0,
    take: (flags & FLAG_TAKEAWAY) !== 0,
  };
}

/** Converte il contenuto di un file tile in un elenco di locali validi. */
export function decodeTile(json) {
  if (!json || !Array.isArray(json.p)) return [];
  return json.p.map(decodePlace).filter(Boolean);
}

/**
 * Locali entro km dal punto, ordinati per distanza.
 * fetchJson(path) deve restituire il JSON o lanciare un errore.
 */
export async function loadPlaces(fetchJson, index, lat, lon, km) {
  const keys = tilesForCircle(lat, lon, km).filter(k => index.tiles && index.tiles[k]);
  const tiles = await Promise.all(keys.map(k => fetchJson(`data/places/${k}.json`)));
  const out = [];
  for (const t of tiles) for (const p of decodeTile(t)) {
    const d = distKm(lat, lon, p.lat, p.lon);
    if (d <= km) out.push({ ...p, d });
  }
  return out.sort((a, b) => a.d - b.d || a.n.localeCompare(b.n));
}

/** Cerca un locale per chiave nel tile che contiene le sue coordinate. */
export async function findPlace(fetchJson, index, key, lat, lon) {
  const k = tilesForCircle(lat, lon, 0.5).filter(t => index.tiles && index.tiles[t]);
  for (const t of k) {
    const p = decodeTile(await fetchJson(`data/places/${t}.json`)).find(x => x.key === key);
    if (p) return p;
  }
  return null;
}

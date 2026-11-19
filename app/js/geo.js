// Calcoli geografici: distanze e riquadri (tile) dei dati.

/** Lato di un tile in gradi. Deve coincidere con scripts/lib/osm.mjs. */
export const TILE_DEG = 1;

/** Distanza in km tra due punti (formula dell'emisenoverso). */
export function distKm(lat1, lon1, lat2, lon2) {
  const R = 6371, t = Math.PI / 180;
  const x = (lat2 - lat1) * t, y = (lon2 - lon1) * t;
  const h = Math.sin(x / 2) ** 2 + Math.cos(lat1 * t) * Math.cos(lat2 * t) * Math.sin(y / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Chiave del tile che contiene il punto, es. "45_9". */
export function tileKey(lat, lon) {
  return `${Math.floor(lat / TILE_DEG) * TILE_DEG}_${Math.floor(lon / TILE_DEG) * TILE_DEG}`;
}

/** Chiavi dei tile toccati da un cerchio di raggio km attorno al punto. */
export function tilesForCircle(lat, lon, km) {
  const dLat = km / 111.32;
  const dLon = km / (111.32 * Math.max(0.05, Math.cos(lat * Math.PI / 180)));
  const keys = new Set();
  const lat0 = Math.floor((lat - dLat) / TILE_DEG), lat1 = Math.floor((lat + dLat) / TILE_DEG);
  const lon0 = Math.floor((lon - dLon) / TILE_DEG), lon1 = Math.floor((lon + dLon) / TILE_DEG);
  for (let a = lat0; a <= lat1; a++) for (let o = lon0; o <= lon1; o++) keys.add(`${a * TILE_DEG}_${o * TILE_DEG}`);
  return [...keys];
}

/** "1,2 km" oppure "350 m". */
export function fmtKm(d) {
  if (d < 1) return `${Math.max(50, Math.round(d * 20) * 50)} m`;
  return `${d.toFixed(1).replace(".", ",")} km`;
}

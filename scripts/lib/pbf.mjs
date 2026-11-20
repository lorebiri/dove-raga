// Dall'estratto OSM dell'Italia (Geofabrik, formato PBF filtrato ed esportato da osmium come
// GeoJSON, un oggetto per riga) agli elementi nel formato già usato da buildPlaces/buildComuni.
// Funzioni pure: niente rete, niente file. Testate in test/unit/pbf.test.mjs.

// Area con segno di un anello [[lon, lat], ...] (formula del laccio) e baricentro.
function ringStats(ring) {
  let a = 0, x = 0, y = 0;
  for (let i = 0, n = ring.length - 1; i < n; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[i + 1];
    const f = x0 * y1 - x1 * y0;
    a += f; x += (x0 + x1) * f; y += (y0 + y1) * f;
  }
  a /= 2;
  return a ? { a, x: x / (6 * a), y: y / (6 * a) } : null;
}

const mean = pts => {
  const s = pts.reduce((m, p) => [m[0] + p[0], m[1] + p[1]], [0, 0]);
  return [s[0] / pts.length, s[1] / pts.length];
};

/** Punto rappresentativo [lat, lon] di una geometria GeoJSON (baricentro dei contorni esterni). */
export function centroid(g) {
  if (!g) return null;
  let lonlat = null;
  if (g.type === "Point") lonlat = g.coordinates;
  else if (g.type === "LineString") lonlat = mean(g.coordinates);
  else if (g.type === "Polygon" || g.type === "MultiPolygon") {
    const outers = g.type === "Polygon" ? [g.coordinates[0]] : g.coordinates.map(p => p[0]);
    let A = 0, X = 0, Y = 0;
    for (const r of outers) {
      const s = ringStats(r);
      if (!s) continue;
      const w = Math.abs(s.a);
      A += w; X += s.x * w; Y += s.y * w;
    }
    lonlat = A ? [X / A, Y / A] : mean(outers.flat());
  }
  if (!lonlat || !Number.isFinite(lonlat[0]) || !Number.isFinite(lonlat[1])) return null;
  return [lonlat[1], lonlat[0]];
}

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Prepara un (Multi)Polygon per test veloci "punto dentro": riquadri per ogni poligono. */
export function prepareArea(g) {
  const polys = g?.type === "Polygon" ? [g.coordinates] : g?.type === "MultiPolygon" ? g.coordinates : [];
  return polys.map(rings => {
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const [x, y] of rings[0]) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
    return { bbox: [w, s, e, n], rings };
  });
}

/** Il punto (lat, lon) è dentro l'area preparata (fuori dai buchi)? */
export function inArea(area, lat, lon) {
  for (const { bbox: [w, s, e, n], rings } of area) {
    if (lon < w || lon > e || lat < s || lat > n) continue;
    if (inRing(lon, lat, rings[0]) && !rings.slice(1).some(h => inRing(lon, lat, h))) return true;
  }
  return false;
}

const TYPES = { n: "node", w: "way", r: "relation" };

/**
 * Feature GeoJSON di osmium → { type, id, tags, center }.
 * Gli id "n123"/"w45"/"r67" restano tali; le aree ("a…") osmium le numera id×2 se nascono da una
 * way e id×2+1 se da una relazione: si torna all'oggetto OSM originale, così le chiavi restano stabili.
 */
export function toElement(f) {
  const m = /^([nwra])(\d+)$/.exec(String(f?.id ?? ""));
  const c = centroid(f?.geometry);
  if (!m || !c) return null;
  let type = TYPES[m[1]], id = Number(m[2]);
  if (m[1] === "a") { type = id % 2 ? "relation" : "way"; id = Math.floor(id / 2); }
  return { type, id, tags: f.properties || {}, center: { lat: c[0], lon: c[1] } };
}

export const isItaly = f => f?.properties?.["ISO3166-1"] === "IT" && f.properties.admin_level === "2";
export const isPlace = t => /^(restaurant|fast_food)$/.test(t?.amenity || "") && /sushi|japanese/i.test(t?.cuisine || "");
export const isAdmin = t => t?.boundary === "administrative" && (t.admin_level === "6" || t.admin_level === "8") && !!t["ref:ISTAT"];

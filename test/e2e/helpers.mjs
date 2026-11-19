// Dati finti per i test: generati dalle stesse funzioni del workflow a partire da risposte Overpass d'esempio.
import { readFileSync } from "node:fs";
import { buildPlaces, buildComuni } from "../../scripts/lib/osm.mjs";

const fx = n => JSON.parse(readFileSync(new URL(`../fixtures/${n}`, import.meta.url), "utf8"));
export const built = buildPlaces(fx("overpass-places.json"), "2026-11-16T03:00:00.000Z");
export const comuni = buildComuni(fx("overpass-comuni.json"), "2026-11-16T03:00:00.000Z");
export const MILANO = { latitude: 45.4642, longitude: 9.19 };
export const NAMES = Object.values(built.tiles).flatMap(t => t.p.map(r => r[1]));

/** Serve i dati di prova al posto di app/data e registra ogni richiesta esterna. */
export async function useFixtureData(page) {
  const external = [];
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") { external.push(url.href); return route.abort(); }
    const m = url.pathname.match(/\/dove-raga\/data\/(.+)$/);
    if (!m) return route.continue();
    let body;
    if (m[1] === "index.json") body = built.index;
    else if (m[1] === "comuni.json") body = comuni;
    else {
      const t = m[1].match(/^places\/(.+)\.json$/);
      body = t && built.tiles[t[1]];
    }
    if (!body) return route.fulfill({ status: 404, body: "not found" });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  return external;
}

/** Larghezza e altezza da un PNG. */
export function pngSize(buf) {
  if (buf.toString("ascii", 1, 4) !== "PNG") throw new Error("non è un PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

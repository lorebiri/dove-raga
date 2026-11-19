// Parsing dei dati: dalle risposte Overpass ai file dell'app, e lettura lato app.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { placeRow, buildPlaces, buildComuni, tileOf } from "../../scripts/lib/osm.mjs";
import { decodePlace, decodeTile, loadPlaces, findPlace } from "../../app/js/data.js";
import { tileKey, TILE_DEG } from "../../app/js/geo.js";
import { TILE_DEG as SCRIPT_TILE_DEG } from "../../scripts/lib/osm.mjs";

const fx = name => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));
const places = fx("overpass-places.json");
const comuni = fx("overpass-comuni.json");

test("placeRow: campi completi e normalizzati", () => {
  const row = placeRow(places.elements[0]);
  assert.deepEqual(row, ["n101", "Nigiri Prova Uno", 45.465, 9.188, 3, "Via Finta 1, Milano",
    "Mo-Su 12:00-15:00,19:00-23:30", "+39 02 0000001", "https://www.esempio-uno.test/"]);
});

test("placeRow: centro delle way, cucina giapponese, campi vuoti tolti in coda", () => {
  assert.deepEqual(placeRow(places.elements[1]), ["w202", "Ramen di Prova Due", 45.47, 9.2, 0]);
});

test("placeRow: primo telefono, sito con schema, scarta senza nome o cucina sbagliata", () => {
  const r = placeRow(places.elements[2]);
  assert.equal(r[7], "+39 02 0000003");
  assert.equal(r[8], "https://esempio-tre.test/");
  assert.equal(r[4] & 1, 1);
  assert.equal(placeRow(places.elements[5]), null); // senza nome
  assert.equal(placeRow(places.elements[6]), null); // pizzeria
});

test("placeRow: link javascript: scartato", () => {
  const r = placeRow(places.elements[7]);
  assert.equal(r[0], "r708");
  assert.equal(r.length, 5);
});

test("buildPlaces: doppioni tolti e divisione in riquadri", () => {
  const { index, tiles } = buildPlaces(places, "2026-11-16T03:00:00.000Z");
  assert.equal(index.count, 7);
  assert.equal(index.generated, "2026-11-16T03:00:00.000Z");
  assert.deepEqual(Object.keys(index.tiles).sort(), ["41_12", "45_9"]);
  assert.equal(index.tiles["45_9"], 6);
  assert.equal(tiles["45_9"].p.length, 6);
  const total = Object.values(index.tiles).reduce((a, b) => a + b, 0);
  assert.equal(total, index.count);
});

test("i riquadri dello script e dell'app coincidono", () => {
  assert.equal(TILE_DEG, SCRIPT_TILE_DEG);
  for (const [la, lo] of [[45.46, 9.19], [41.9, 12.49], [-0.5, -0.5], [46, 9], [36.99, 15.08]]) {
    assert.equal(tileOf(la, lo), tileKey(la, lo));
  }
});

test("buildComuni: sigla dalla provincia, ordinati per abitanti, scarta senza centro", () => {
  const out = buildComuni(comuni, "x");
  assert.equal(out.v, 1);
  const names = out.c.map(r => r[0]);
  assert.equal(names[0], "Roma");
  assert.equal(names[1], "Milano");
  assert.ok(!names.includes("Senza Centro"));
  const milano = out.c.find(r => r[0] === "Milano");
  assert.deepEqual(milano, ["Milano", 45.4642, 9.19, "MI", 1371498]);
  assert.equal(out.c.find(r => r[0] === "Romano di Lombardia")[3], ""); // provincia 016 assente nel campione
  assert.equal(out.c.find(r => r[0] === "Forlì")[3], "");
});

test("decodePlace: righe valide e non valide", () => {
  assert.deepEqual(decodePlace(["n1", "A", 45, 9, 3]), { key: "n1", n: "A", lat: 45, lon: 9, a: "", h: "", t: "", w: "", sushi: true, take: true });
  assert.equal(decodePlace(["n1", "", 45, 9]), null);
  assert.equal(decodePlace(["n1", "A", "45", 9]), null);
  assert.equal(decodePlace(null), null);
  assert.equal(decodePlace(["n1"]), null);
  assert.deepEqual(decodeTile({}), []);
  assert.deepEqual(decodeTile(null), []);
});

test("dal file generato all'app: stessi locali", () => {
  const { tiles } = buildPlaces(places);
  const decoded = decodeTile(JSON.parse(JSON.stringify(tiles["45_9"])));
  assert.equal(decoded.length, 6);
  const uno = decoded.find(p => p.key === "n101");
  assert.equal(uno.a, "Via Finta 1, Milano");
  assert.equal(uno.take, true);
});

function fakeFetch(built) {
  const calls = [];
  const fn = async path => {
    calls.push(path);
    const m = path.match(/^data\/places\/(.+)\.json$/);
    if (m && built.tiles[m[1]]) return JSON.parse(JSON.stringify(built.tiles[m[1]]));
    throw new Error("404 " + path);
  };
  fn.calls = calls;
  return fn;
}

test("loadPlaces: filtra per raggio, ordina per distanza, chiede solo i riquadri esistenti", async () => {
  const built = buildPlaces(places);
  const f = fakeFetch(built);
  const near = await loadPlaces(f, built.index, 45.4642, 9.19, 2);
  assert.deepEqual(near.map(p => p.key), ["n101", "w202"]);
  assert.ok(near[0].d < near[1].d);
  const wide = await loadPlaces(f, built.index, 45.4642, 9.19, 25);
  assert.equal(wide.length, 5);
  assert.ok(f.calls.every(c => c === "data/places/45_9.json"));
});

test("loadPlaces: cerchio a cavallo di più riquadri", async () => {
  const built = buildPlaces(places);
  const f = fakeFetch(built);
  const r = await loadPlaces(f, built.index, 46.01, 8.99, 5);
  assert.deepEqual(r.map(p => p.key), ["n910"]);
});

test("findPlace: trova per chiave, null se sparito", async () => {
  const built = buildPlaces(places);
  const f = fakeFetch(built);
  assert.equal((await findPlace(f, built.index, "n809", 41.9, 12.49)).n, "Temaki Roma Sei");
  assert.equal(await findPlace(f, built.index, "n999", 41.9, 12.49), null);
});

import { zones, placesQuery, comuniQuery, mergeResponses, plausible, ITALY_BBOX } from "../../scripts/lib/osm.mjs";

test("zones: coprono l'Italia senza buchi né sovrapposizioni", () => {
  const zs = zones();
  assert.ok(zs.length > 20 && zs.length < 60, `${zs.length} zone`);
  const area = zs.reduce((a, [s, w, n, e]) => a + (n - s) * (e - w), 0);
  const [S, W, N, E] = ITALY_BBOX;
  assert.ok(Math.abs(area - (N - S) * (E - W)) < 1e-6);
  for (const [la, lo] of [[45.4642, 9.19], [41.9, 12.49], [37.5, 15.09], [38.11, 13.36], [39.22, 9.12], [46.5, 11.35], [40.85, 14.27]]) {
    const hits = zs.filter(([s, w, n, e]) => la >= s && la < n && lo >= w && lo < e);
    assert.equal(hits.length, 1, `${la},${lo}`);
  }
});

test("query per zona: riquadro e filtri giusti", () => {
  const q = placesQuery([45, 9, 47, 11]);
  assert.match(q, /nwr\(area\.it\)\(45,9,47,11\)/);
  assert.match(q, /cuisine"~"sushi\|japanese",i/);
  assert.match(comuniQuery([45, 9, 47, 11]), /admin_level"="8"[\s\S]*out tags center/);
});

test("mergeResponses: toglie i doppioni tra zone confinanti", () => {
  const a = { elements: [{ type: "node", id: 1 }, { type: "way", id: 1 }] };
  const b = { elements: [{ type: "node", id: 1 }, { type: "relation", id: 9 }] };
  assert.deepEqual(mergeResponses([a, b, null]).elements.map(e => e.type + e.id), ["node1", "way1", "relation9"]);
});

test("plausible: minimo e crollo rispetto alla copia precedente", () => {
  assert.equal(plausible(3000, { min: 500 }), "");
  assert.match(plausible(100, { min: 500 }), /minimo/);
  assert.match(plausible(2000, { min: 500, previous: 3000, maxDrop: 0.2 }), /calo/);
  assert.equal(plausible(2900, { min: 500, previous: 3000, maxDrop: 0.2 }), "");
});

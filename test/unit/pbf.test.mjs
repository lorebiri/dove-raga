// Dall'export GeoJSON di osmium agli elementi: baricentri, confine, id stabili.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { centroid, prepareArea, inArea, toElement, isItaly, isPlace, isAdmin } from "../../scripts/lib/pbf.mjs";

const square = (s, w, n, e) => [[w, s], [e, s], [e, n], [w, n], [w, s]];

test("centroid: punto, poligono, multipoligono pesato per area", () => {
  assert.deepEqual(centroid({ type: "Point", coordinates: [11, 44] }), [44, 11]);
  const c = centroid({ type: "Polygon", coordinates: [square(44, 10, 46, 12)] });
  assert.ok(Math.abs(c[0] - 45) < 1e-9 && Math.abs(c[1] - 11) < 1e-9);
  // quadrato grande (area 4) e piccolo (area 1): il baricentro sta più vicino al grande
  const m = centroid({ type: "MultiPolygon", coordinates: [[square(0, 0, 2, 2)], [square(0, 10, 1, 11)]] });
  assert.ok(m[1] > 1 && m[1] < 5);
  assert.equal(centroid(null), null);
});

test("inArea: dentro, fuori, nei buchi (enclave)", () => {
  const area = prepareArea({ type: "Polygon", coordinates: [square(40, 10, 46, 16), square(43.9, 12.4, 44, 12.5)] });
  assert.equal(inArea(area, 45, 11), true);
  assert.equal(inArea(area, 47, 11), false);
  assert.equal(inArea(area, 43.95, 12.45), false, "San Marino è un buco nel confine");
});

test("toElement: id di nodi, way e aree di osmium tornano agli oggetti OSM", () => {
  const pt = { type: "Point", coordinates: [11, 44] };
  assert.deepEqual(toElement({ id: "n5", geometry: pt, properties: { a: 1 } }), { type: "node", id: 5, tags: { a: 1 }, center: { lat: 44, lon: 11 } });
  assert.equal(toElement({ id: "a8", geometry: pt }).type, "way");
  assert.equal(toElement({ id: "a8", geometry: pt }).id, 4);
  assert.equal(toElement({ id: "a1003", geometry: pt }).type, "relation");
  assert.equal(toElement({ id: "a1003", geometry: pt }).id, 501);
  assert.equal(toElement({ id: "x1", geometry: pt }), null);
});

test("filtri: Italia, locali, confini con codice ISTAT", () => {
  assert.ok(isItaly({ properties: { "ISO3166-1": "IT", admin_level: "2" } }));
  assert.ok(!isItaly({ properties: { "ISO3166-1": "CH", admin_level: "2" } }));
  assert.ok(isPlace({ amenity: "fast_food", cuisine: "Japanese;ramen" }));
  assert.ok(!isPlace({ amenity: "restaurant", cuisine: "pizza" }));
  assert.ok(isAdmin({ boundary: "administrative", admin_level: "8", "ref:ISTAT": "037006" }));
  assert.ok(!isAdmin({ boundary: "administrative", admin_level: "8" }));
});

// Prova completa con osmium vero, se installato (in CI sì; in locale si salta).
let hasOsmium = true;
try { execFileSync("osmium", ["--version"], { stdio: "ignore" }); } catch { hasOsmium = false; }
test("fetch-data su una mini Italia: scarta i locali fuori confine e la pizzeria", { skip: !hasOsmium && "osmium non installato" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "dove-raga-"));
  const pbf = join(dir, "mini.osm.pbf");
  execFileSync("osmium", ["sort", "test/fixtures/mini-italia.osm", "-o", pbf]);
  execFileSync(process.execPath, ["scripts/fetch-data.mjs", "--pbf", pbf], {
    env: { ...process.env, WORK_DIR: dir, OUT_DIR: join(dir, "out"), MIN_PLACES: "1", MIN_COMUNI: "1" }, stdio: "ignore",
  });
  const index = JSON.parse(readFileSync(join(dir, "out", "index.json"), "utf8"));
  assert.equal(index.count, 2);
  const rows = readdirSync(join(dir, "out", "places")).flatMap(f => JSON.parse(readFileSync(join(dir, "out", "places", f), "utf8")).p);
  assert.deepEqual(rows.map(r => r[0]).sort(), ["n100", "w4"]);
  assert.equal(rows.find(r => r[0] === "n100")[4], 3, "sushi + asporto");
  const comuni = JSON.parse(readFileSync(join(dir, "out", "comuni.json"), "utf8"));
  assert.deepEqual(comuni.c, [["Comune Prova", 44.5, 11.3, "BO", 12345]]);
});

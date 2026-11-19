// Logica di selezione, geografia, link di gruppo, ricerca comuni.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { distKm, tileKey, tilesForCircle, fmtKm } from "../../app/js/geo.js";
import { rng, newSeed, pickPlace, inPlay } from "../../app/js/pick.js";
import { encodeResult, decodeResult, shareUrl } from "../../app/js/link.js";
import { norm, prepareComuni, searchComuni, label } from "../../app/js/comuni.js";
import { buildComuni } from "../../scripts/lib/osm.mjs";

test("distKm: Milano–Roma circa 477 km, zero su sé stesso", () => {
  assert.ok(Math.abs(distKm(45.4642, 9.19, 41.9028, 12.4964) - 477) < 3);
  assert.equal(distKm(45, 9, 45, 9), 0);
});

test("tileKey e tilesForCircle", () => {
  assert.equal(tileKey(45.46, 9.19), "45_9");
  assert.equal(tileKey(-0.1, -0.1), "-1_-1");
  assert.deepEqual(tilesForCircle(45.5, 9.5, 2), ["45_9"]);
  assert.deepEqual(tilesForCircle(45.99, 9.99, 5).sort(), ["45_10", "45_9", "46_10", "46_9"]);
});

test("fmtKm", () => {
  assert.equal(fmtKm(1.234), "1,2 km");
  assert.equal(fmtKm(0.34), "350 m");
  assert.equal(fmtKm(0.01), "50 m");
  assert.equal(fmtKm(12), "12,0 km");
});

test("rng: deterministico e in [0,1)", () => {
  const a = rng(42), b = rng(42);
  for (let i = 0; i < 1000; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
  assert.notEqual(rng(1)(), rng(2)());
});

test("newSeed: intero a 32 bit", () => {
  const s = newSeed();
  assert.ok(Number.isInteger(s) && s >= 0 && s < 2 ** 32);
});

const pool = Array.from({ length: 5 }, (_, i) => ({ key: "n" + i, n: "Locale " + i }));

test("pickPlace: stesso seme, stesso locale", () => {
  for (let s = 0; s < 50; s++) assert.equal(pickPlace(pool, s), pickPlace(pool, s));
});

test("pickPlace: non ripete il tiro precedente se c'è altro", () => {
  for (let s = 0; s < 500; s++) assert.notEqual(pickPlace(pool, s, "n2").key, "n2");
  assert.equal(pickPlace([pool[0]], 7, "n0").key, "n0");
  assert.equal(pickPlace([], 7), null);
});

test("pickPlace: distribuzione uniforme (circa)", () => {
  const counts = {};
  const N = 20000;
  for (let s = 0; s < N; s++) { const k = pickPlace(pool, s * 2654435761).key; counts[k] = (counts[k] || 0) + 1; }
  for (const p of pool) assert.ok(Math.abs(counts[p.key] / N - 0.2) < 0.02, `${p.key}: ${counts[p.key]}`);
});

test("inPlay: toglie gli esclusi", () => {
  assert.deepEqual(inPlay(pool, new Set(["n1", "n3"])).map(p => p.key), ["n0", "n2", "n4"]);
});

const place = { key: "n123456789", n: "Sushì «Zen» & Co. 🍣", lat: 45.4650123, lon: 9.1880987, sushi: true, d: 1.2 };

test("link di gruppo: andata e ritorno", () => {
  const enc = encodeResult(place, "Milano");
  assert.match(enc, /^g=[A-Za-z0-9_-]+$/);
  const dec = decodeResult("#" + enc);
  assert.equal(dec.key, place.key);
  assert.equal(dec.n, place.n);
  assert.equal(dec.lat, 45.46501);
  assert.equal(dec.lon, 9.1881);
  assert.equal(dec.sushi, true);
  assert.equal(dec.zone, "Milano");
});

test("link di gruppo: niente posizione di chi tira, solo il locale", () => {
  const raw = JSON.parse(Buffer.from(encodeResult(place).slice(2), "base64url").toString("utf8"));
  assert.deepEqual(Object.keys(raw).sort(), ["k", "la", "lo", "n", "s", "v"]);
});

test("link di gruppo: url completo senza vecchio frammento", () => {
  const u = shareUrl("https://lorebiri.github.io/dove-raga/#g=vecchio", place, "");
  assert.ok(u.startsWith("https://lorebiri.github.io/dove-raga/#g="));
  assert.equal(decodeResult(new URL(u).hash).key, place.key);
});

test("link di gruppo: input non validi", () => {
  const bad = o => "#g=" + Buffer.from(JSON.stringify(o)).toString("base64url");
  for (const h of ["", "#", "#qualcosa", "#g=", "#g=@@@", "#g=" + "A".repeat(3000),
    bad({ v: 2, k: "n1", n: "x", la: 1, lo: 1 }),
    bad({ v: 1, k: "x1", n: "x", la: 1, lo: 1 }),
    bad({ v: 1, k: "n1", n: "", la: 1, lo: 1 }),
    bad({ v: 1, k: "n1", n: "x", la: 91, lo: 1 }),
    bad({ v: 1, k: "n1", n: "x", la: "1", lo: 1 })]) {
    assert.equal(decodeResult(h), null, h.slice(0, 40));
  }
});

const list = prepareComuni(buildComuni(JSON.parse(readFileSync(new URL("../fixtures/overpass-comuni.json", import.meta.url), "utf8"))));

test("norm: accenti, apostrofi, maiuscole", () => {
  assert.equal(norm("  Forlì "), "forli");
  assert.equal(norm("Sant’Anastasia"), "sant anastasia");
  assert.equal(norm("Sant'Anastasia"), "sant anastasia");
});

test("searchComuni: prefisso, parole interne, popolazione", () => {
  assert.deepEqual(searchComuni(list, "rom").map(c => c.name), ["Roma", "Romano di Lombardia"]);
  assert.deepEqual(searchComuni(list, "reggio").map(c => label(c)), ["Reggio nell'Emilia (RE)", "Reggio di Calabria (RC)"]);
  assert.deepEqual(searchComuni(list, "calabria").map(c => c.name), ["Reggio di Calabria"]);
  assert.deepEqual(searchComuni(list, "forli").map(c => c.name), ["Forlì"]);
  assert.deepEqual(searchComuni(list, "sant anas").map(c => c.name), ["Sant'Anastasia"]);
  assert.deepEqual(searchComuni(list, ""), []);
  assert.deepEqual(searchComuni(list, "zzz"), []);
  assert.equal(searchComuni(list, "r", 2).length, 2);
});

test("prepareComuni: righe rotte ignorate", () => {
  assert.equal(prepareComuni({ c: [["A", 1, 2], ["B", "x", 2], null, [3, 1, 2]] }).length, 1);
  assert.deepEqual(prepareComuni(null), []);
});

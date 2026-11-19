// Controlla la copia dei dati in app/data (se presente): coerenza tra indice e riquadri.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { decodeTile } from "../../app/js/data.js";
import { prepareComuni } from "../../app/js/comuni.js";

const dir = new URL("../../app/data/", import.meta.url);
const has = existsSync(new URL("index.json", dir));
const read = p => JSON.parse(readFileSync(new URL(p, dir), "utf8"));

test("dati: indice coerente con i riquadri", { skip: !has && "nessun dato ancora generato" }, () => {
  const ix = read("index.json");
  assert.equal(ix.v, 1);
  assert.ok(!isNaN(new Date(ix.generated)));
  const files = readdirSync(new URL("places/", dir)).filter(f => f.endsWith(".json")).map(f => f.slice(0, -5)).sort();
  assert.deepEqual(files, Object.keys(ix.tiles).sort());
  let total = 0;
  for (const k of files) {
    const t = read(`places/${k}.json`);
    const decoded = decodeTile(t);
    assert.equal(decoded.length, t.p.length, `righe non valide in ${k}`);
    assert.equal(decoded.length, ix.tiles[k]);
    const [la, lo] = k.split("_").map(Number);
    for (const p of decoded) assert.ok(p.lat >= la && p.lat < la + ix.tileDeg && p.lon >= lo && p.lon < lo + ix.tileDeg, `${p.key} fuori da ${k}`);
    total += decoded.length;
  }
  assert.equal(total, ix.count);
  assert.ok(existsSync(new URL("LICENSE.txt", dir)), "manca la licenza ODbL");
});

test("dati: comuni validi", { skip: !existsSync(new URL("comuni.json", dir)) && "nessun elenco comuni" }, () => {
  const raw = read("comuni.json");
  const list = prepareComuni(raw);
  assert.equal(list.length, raw.c.length);
  assert.ok(list.length > 7000);
  for (const n of ["Roma", "Milano", "Napoli", "Torino", "Palermo"]) assert.ok(list.some(c => c.name === n), n);
});

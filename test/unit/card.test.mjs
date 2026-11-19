// Generazione della cartolina: impaginazione del testo e contenuto disegnato.
import { test } from "node:test";
import assert from "node:assert/strict";
import { wrapLines, fitText, drawCard, CARD_W, CARD_H } from "../../app/js/card.js";

// Contesto 2D finto: registra i testi; larghezza = caratteri × 0,6 × dimensione del font.
function fakeCtx() {
  const texts = [];
  const grad = { addColorStop() {} };
  const ctx = new Proxy({
    font: "10px x", texts,
    measureText(t) { const size = parseFloat(this.font.match(/(\d+(?:\.\d+)?)px/)[1]); return { width: t.length * size * 0.6 }; },
    fillText(t, x, y) { texts.push({ t, x, y, font: this.font }); },
    createLinearGradient: () => grad,
  }, { get: (o, k) => (k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
  return ctx;
}

test("wrapLines: a capo per parole e spezza le parole lunghe", () => {
  const m = t => t.length;
  assert.deepEqual(wrapLines(m, "uno due tre quattro", 8), ["uno due", "tre", "quattro"]);
  const long = wrapLines(m, "supercalifragilistico", 8);
  assert.ok(long.length > 1);
  assert.ok(long.every(l => l.length <= 8));
  assert.equal(long.join("").replace(/-/g, ""), "supercalifragilistico");
  assert.deepEqual(wrapLines(m, "", 8), []);
});

test("fitText: rimpicciolisce e poi tronca con i puntini", () => {
  const ctx = fakeCtx();
  const short = fitText(ctx, "Sushi Bar", 888, 4, [118, 80], "x");
  assert.equal(short.size, 118);
  assert.deepEqual(short.lines, ["Sushi Bar"]);
  const huge = fitText(ctx, "parola ".repeat(100), 888, 4, [118, 80], "x");
  assert.equal(huge.size, 80);
  assert.equal(huge.lines.length, 4);
  assert.ok(huge.lines[3].endsWith("…"));
});

test("drawCard: formato 9:16 e contenuti", () => {
  assert.equal(CARD_W / CARD_H, 9 / 16);
  const ctx = fakeCtx();
  const out = drawCard(ctx, { name: "Nigiri Prova Uno", dist: "1,2 km", kind: "Sushi", url: "lorebiri.github.io/dove-raga" });
  const all = ctx.texts.map(x => x.t).join("\n");
  assert.equal(out.nameLines.join(" "), "Nigiri Prova Uno");
  assert.match(all, /a 1,2 km/);
  assert.match(all, /^sushi$/m);
  assert.match(all, /IL DADO HA DECISO/);
  assert.match(all, /lorebiri\.github\.io\/dove-raga/);
  assert.match(all, /OpenStreetMap/);
  assert.match(all, /dove raga\?/);
  assert.ok(out.tagBottom < CARD_H - 300, "le etichette non toccano il piede");
  assert.ok(out.nameLines.length <= 3);
  for (const t of ctx.texts) {
    assert.ok(t.x >= 0 && t.y > 0 && t.y < CARD_H, `fuori dalla cartolina: ${t.t}`);
    const size = parseFloat(t.font.match(/(\d+)px/)[1]);
    assert.ok(t.x + t.t.length * size * 0.6 <= CARD_W, `troppo largo: ${t.t}`);
  }
});

test("drawCard: nome lunghissimo resta dentro e non copre il piede", () => {
  const ctx = fakeCtx();
  const out = drawCard(ctx, { name: "Uramaki Quattro: il nome lunghissimo che va a capo più volte sulla cartolina ".repeat(3), dist: "", kind: "Giapponese", url: "x" });
  assert.ok(out.nameLines.length <= 3);
  assert.ok(out.nameLines.at(-1).endsWith("…"));
  assert.ok(out.tagBottom < CARD_H - 300, "le etichette non toccano il piede");
  assert.ok(ctx.texts.some(t => t.t === "giapponese"));
  assert.ok(!ctx.texts.some(t => /^a /.test(t.t)), "senza distanza niente etichetta");
});

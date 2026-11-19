// Cartolina 9:16 (1080×1920) del risultato, disegnata su canvas.

export const CARD_W = 1080;
export const CARD_H = 1920;

const C = {
  bg: "#141A17", bg2: "#1E2622", ink: "#EEF0EA", soy: "#A3ABA4",
  salmon: "#F0866D", salmon2: "#E2694F", salmonLight: "#F59A6B",
  grain: "#F6F3EA", grainShade: "#DAD5C6", pip: "#1C2420", stripe: "#FFF4EC",
};
const DISPLAY = '"Dela Gothic One", "Arial Black", sans-serif';
const BODY = '"Zen Kaku Gothic New", system-ui, sans-serif';

/** Va a capo per parole; spezza le parole troppo lunghe. measure(testo) → larghezza. */
export function wrapLines(measure, text, maxW) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (let w of words) {
    while (measure(w) > maxW && w.length > 1) {
      let i = w.length - 1;
      while (i > 1 && measure(w.slice(0, i) + "-") > maxW) i--;
      if (cur) { lines.push(cur); cur = ""; }
      lines.push(w.slice(0, i) + "-");
      w = w.slice(i);
    }
    const next = cur ? cur + " " + w : w;
    if (cur && measure(next) > maxW) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Sceglie la dimensione più grande che fa stare il testo in maxLines righe. */
export function fitText(ctx, text, maxW, maxLines, sizes, family) {
  for (const size of sizes) {
    ctx.font = `${size}px ${family}`;
    const lines = wrapLines(t => ctx.measureText(t).width, text, maxW);
    if (lines.length <= maxLines) return { size, lines };
  }
  const size = sizes[sizes.length - 1];
  ctx.font = `${size}px ${family}`;
  const lines = wrapLines(t => ctx.measureText(t).width, text, maxW).slice(0, maxLines);
  const last = lines.length - 1;
  while (lines[last].length > 1 && ctx.measureText(lines[last] + "…").width > maxW) lines[last] = lines[last].slice(0, -1);
  lines[last] = lines[last].replace(/[\s-]+$/, "") + "…";
  return { size, lines };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Il dado-nigiri dell'icona, disegnato in un quadrato di lato s con angolo in (x, y). */
function drawNigiri(ctx, x, y, s) {
  const k = s / 512;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.beginPath(); ctx.ellipse(256, 440, 150, 22, 0, 0, Math.PI * 2); ctx.fill();
  const side = (pts, fill) => {
    ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.closePath();
    ctx.fillStyle = fill; ctx.strokeStyle = fill; ctx.lineWidth = 18; ctx.lineJoin = "round"; ctx.fill(); ctx.stroke();
  };
  side([[112, 215], [256, 290], [256, 430], [112, 355]], C.grain);
  side([[256, 290], [400, 215], [400, 355], [256, 430]], C.grainShade);
  ctx.fillStyle = C.pip;
  const pips = (m, pts, rx, ry) => {
    for (const [u, v] of pts) {
      ctx.save(); ctx.transform(...m); ctx.beginPath(); ctx.ellipse(u, v, rx, ry, 0, 0, Math.PI * 2); ctx.restore(); ctx.fill();
    }
  };
  pips([144, 75, 0, 140, 112, 215], [[.3, .45], [.7, .8]], .11, .1);
  pips([144, -75, 0, 140, 256, 290], [[.24, .34], [.5, .62], [.76, .88]], .1, .09);
  const slice = () => {
    ctx.beginPath(); ctx.moveTo(96, 214);
    ctx.quadraticCurveTo(170, 158, 256, 126); ctx.quadraticCurveTo(342, 158, 416, 214);
    ctx.quadraticCurveTo(350, 305, 256, 326); ctx.quadraticCurveTo(162, 305, 96, 214); ctx.closePath();
  };
  const g = ctx.createLinearGradient(96, 126, 416, 326);
  g.addColorStop(0, C.salmonLight); g.addColorStop(1, C.salmon2);
  slice(); ctx.fillStyle = g; ctx.fill();
  ctx.save(); slice(); ctx.clip();
  ctx.strokeStyle = C.stripe; ctx.globalAlpha = .85; ctx.lineWidth = 11; ctx.lineCap = "round";
  for (const [a, b, c, d, e, f] of [[60, 230, 160, 190, 300, 110], [110, 280, 220, 235, 360, 150], [170, 330, 280, 285, 420, 200]]) {
    ctx.beginPath(); ctx.moveTo(a, b); ctx.quadraticCurveTo(c, d, e, f); ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

/**
 * Disegna la cartolina. data = { name, dist, kind, url }.
 * dist è già formattata ("1,2 km") oppure vuota; kind è "Sushi" o "Giapponese".
 */
export function drawCard(ctx, data) {
  const W = CARD_W, H = CARD_H, M = 96;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, C.bg2); bg.addColorStop(1, C.bg);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // strisce del tappetino di bambù in alto
  ctx.fillStyle = "rgba(255,255,255,.035)";
  for (let y = 0; y < 300; y += 18) ctx.fillRect(0, y, W, 2);

  // marchio
  ctx.fillStyle = C.soy;
  ctx.font = `700 34px ${BODY}`;
  ctx.fillText("おまかせ · DECIDE IL DADO", M, 190);
  ctx.font = `120px ${DISPLAY}`;
  ctx.fillStyle = C.ink;
  ctx.fillText("Dove ", M, 330);
  const wDove = ctx.measureText("Dove ").width;
  ctx.fillStyle = C.salmon;
  ctx.fillText("raga", M + wDove, 330);
  const wRaga = ctx.measureText("raga").width;
  ctx.fillStyle = C.ink;
  ctx.fillText("?", M + wDove + wRaga, 330);

  // dado
  drawNigiri(ctx, (W - 520) / 2, 400, 520);

  // risultato
  ctx.fillStyle = C.soy;
  ctx.font = `700 44px ${BODY}`;
  ctx.fillText("Il dado ha deciso:", M, 1060);

  const fit = fitText(ctx, data.name, W - 2 * M, 4, [118, 104, 92, 80, 70, 62], DISPLAY);
  ctx.font = `${fit.size}px ${DISPLAY}`;
  ctx.fillStyle = C.ink;
  const lh = Math.round(fit.size * 1.12);
  let y = 1060 + 40 + fit.size;
  for (const line of fit.lines) { ctx.fillText(line, M, y); y += lh; }

  // etichetta tipo · distanza
  const pill = [data.kind, data.dist && `a ${data.dist}`].filter(Boolean).join(" · ").toUpperCase();
  ctx.font = `700 40px ${BODY}`;
  const pw = ctx.measureText(pill).width + 64;
  const py = y - lh + fit.size * 0.35 + 30;
  roundRect(ctx, M, py, pw, 76, 38);
  ctx.fillStyle = "#3A2420"; ctx.fill();
  ctx.fillStyle = C.salmon;
  ctx.fillText(pill, M + 32, py + 52);

  // piede
  ctx.fillStyle = C.salmon;
  roundRect(ctx, M, H - 330, W - 2 * M, 150, 32); ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `52px ${DISPLAY}`;
  ctx.fillText("Tira anche tu →", M + 44, H - 270);
  ctx.font = `700 40px ${BODY}`;
  ctx.fillText(data.url, M + 44, H - 210);
  ctx.fillStyle = C.soy;
  ctx.font = `30px ${BODY}`;
  ctx.fillText("Dati © contributori OpenStreetMap (ODbL)", M, H - 110);
  return { nameSize: fit.size, nameLines: fit.lines };
}

/** Crea la cartolina come PNG (Blob) nel browser. */
export async function renderCardBlob(doc, data) {
  if (doc.fonts?.load) {
    await Promise.all([
      doc.fonts.load(`120px "Dela Gothic One"`),
      doc.fonts.load(`700 40px "Zen Kaku Gothic New"`),
      doc.fonts.load(`400 30px "Zen Kaku Gothic New"`),
    ]).catch(() => {});
  }
  const canvas = doc.createElement("canvas");
  canvas.width = CARD_W; canvas.height = CARD_H;
  drawCard(canvas.getContext("2d"), data);
  return new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error("toBlob"))), "image/png"));
}

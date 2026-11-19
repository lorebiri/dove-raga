// Cartolina 9:16 (1080×1920) del risultato, disegnata su canvas.

export const CARD_W = 1080;
export const CARD_H = 1920;

const C = { y: "#FFE600", ink: "#121212", sal: "#FF5A36", mint: "#00D68F", blue: "#2B4BFF", white: "#FFFFFF", soft: "#3D3600" };
const DISPLAY = '"Bricolage", "Arial Black", sans-serif';
const BODY = '"Rubik", system-ui, sans-serif';

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
export function fitText(ctx, text, maxW, maxLines, sizes, family, weight = "") {
  const f = size => `${weight} ${size}px ${family}`.trim();
  for (const size of sizes) {
    ctx.font = f(size);
    const lines = wrapLines(t => ctx.measureText(t).width, text, maxW);
    if (lines.length <= maxLines) return { size, lines };
  }
  const size = sizes[sizes.length - 1];
  ctx.font = f(size);
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

/** Adesivo: rettangolo arrotondato col bordo nero e l'ombra piena, ruotato attorno all'angolo (x, y). */
function sticker(ctx, x, y, w, h, deg, fill, draw, { r = 44, shadow = C.ink } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(deg * Math.PI / 180);
  roundRect(ctx, 16, 16, w, h, r); ctx.fillStyle = shadow; ctx.fill();
  roundRect(ctx, 0, 0, w, h, r); ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = 8; ctx.strokeStyle = C.ink; ctx.stroke();
  draw?.();
  ctx.restore();
}

/**
 * Disegna la cartolina. data = { name, dist, kind, url }; mascot è un'immagine già caricata (facoltativa).
 * dist è già formattata ("1,2 km") oppure vuota; kind è "Sushi" o "Giapponese".
 */
export function drawCard(ctx, data, mascot = null) {
  const W = CARD_W, H = CARD_H, M = 70;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  // sfondo giallo a puntini
  ctx.fillStyle = C.y; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(0,0,0,.08)";
  for (let y = 24; y < H; y += 48) for (let x = 24; x < W; x += 48) { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); }

  // marchio e fumetto
  ctx.font = `800 70px ${DISPLAY}`;
  const brandW = ctx.measureText("dove raga?").width + 68;
  sticker(ctx, M, 100, brandW, 110, -3, C.white, () => {
    ctx.fillStyle = C.ink; ctx.font = `800 70px ${DISPLAY}`; ctx.fillText("dove raga?", 34, 78);
  });
  ctx.font = `700 46px ${BODY}`;
  const bub = "deciso. non si discute!";
  const bubW = ctx.measureText(bub).width + 72;
  sticker(ctx, W - M - bubW, 268, bubW, 96, 2, C.blue, () => {
    ctx.fillStyle = C.white; ctx.font = `700 46px ${BODY}`; ctx.fillText(bub, 36, 64);
  }, { r: 40 });

  // mascotte
  if (mascot) {
    ctx.save(); ctx.translate(540, 650); ctx.rotate(4 * Math.PI / 180);
    ctx.drawImage(mascot, -250, -250, 500, 500);
    ctx.restore();
  }

  // risultato
  const inner = W - 2 * M - 100;
  const fit = fitText(ctx, data.name, inner, 3, [132, 116, 100, 88, 76, 66], DISPLAY, "800");
  const lh = Math.round(fit.size * 0.95);
  const boxH = 44 + 56 + 30 + lh * fit.lines.length + 34;
  const top = 930;
  sticker(ctx, M, top, W - 2 * M, boxH, -2, C.white, () => {
    ctx.font = `800 36px ${BODY}`;
    const lab = "IL DADO HA DECISO";
    const lw = ctx.measureText(lab).width + 36;
    roundRect(ctx, 50, 44, lw, 56, 12); ctx.fillStyle = C.ink; ctx.fill();
    ctx.fillStyle = C.y; ctx.fillText(lab, 68, 85);
    ctx.fillStyle = C.ink; ctx.font = `800 ${fit.size}px ${DISPLAY}`;
    let y = 44 + 56 + 30 + fit.size * 0.8;
    for (const line of fit.lines) { ctx.fillText(line, 50, y); y += lh; }
  });

  // etichette: distanza e tipo
  let tx = M + 20;
  const tagY = top + boxH + 50;
  for (const [text, fill, ink, deg] of [[data.dist && `a ${data.dist}`, C.mint, C.ink, 3], [data.kind.toLowerCase(), C.sal, C.ink, -4]]) {
    if (!text) continue;
    ctx.font = `800 50px ${BODY}`;
    const w = ctx.measureText(text).width + 68;
    sticker(ctx, tx, tagY, w, 92, deg, fill, () => { ctx.fillStyle = ink; ctx.font = `800 50px ${BODY}`; ctx.fillText(text, 34, 64); }, { r: 30 });
    tx += w + 50;
  }

  // invito
  sticker(ctx, M, H - 300, W - 2 * M, 170, 0, C.ink, () => {
    ctx.fillStyle = C.y; ctx.font = `800 62px ${DISPLAY}`; ctx.fillText("tira anche tu →", 44, 78);
    ctx.fillStyle = C.white; ctx.font = `700 40px ${BODY}`; ctx.fillText(data.url, 44, 134);
  }, { r: 40, shadow: C.sal });
  ctx.fillStyle = C.soft;
  ctx.font = `400 26px ${BODY}`;
  ctx.fillText("Dati © contributori OpenStreetMap (ODbL)", M, H - 50);
  return { nameSize: fit.size, nameLines: fit.lines, nameBottom: top + boxH, tagBottom: tagY + 92 };
}

function loadImage(doc, src) {
  return new Promise(res => {
    const img = new (doc.defaultView.Image)();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

/** Crea la cartolina come PNG (Blob) nel browser. */
export async function renderCardBlob(doc, data, mascotSrc = "") {
  if (doc.fonts?.load) {
    await Promise.all([
      doc.fonts.load(`800 120px "Bricolage"`),
      doc.fonts.load(`700 40px "Rubik"`),
      doc.fonts.load(`800 40px "Rubik"`),
    ]).catch(() => {});
  }
  const mascot = mascotSrc ? await loadImage(doc, mascotSrc) : null;
  const canvas = doc.createElement("canvas");
  canvas.width = CARD_W; canvas.height = CARD_H;
  drawCard(canvas.getContext("2d"), data, mascot);
  return new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error("toBlob"))), "image/png"));
}

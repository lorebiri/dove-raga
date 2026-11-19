// Link di gruppo: il risultato del tiro viaggia nel frammento (#) dell'indirizzo.
// Il frammento non viene mai inviato al server; nel link non c'è la posizione di chi tira.

const PREFIX = "g=";

function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

const round5 = x => Math.round(x * 1e5) / 1e5;

/** Dati del risultato da mettere nel link. zone è facoltativa (nome della città cercata). */
export function encodeResult(place, zone = "") {
  const o = { v: 1, k: place.key, n: place.n, la: round5(place.lat), lo: round5(place.lon), s: place.sushi ? 1 : 0 };
  if (zone) o.z = String(zone).slice(0, 60);
  return PREFIX + b64urlEncode(JSON.stringify(o));
}

/** Indirizzo completo da condividere. base è l'indirizzo dell'app senza frammento. */
export function shareUrl(base, place, zone) {
  return `${base.split("#")[0]}#${encodeResult(place, zone)}`;
}

/** Legge il frammento; restituisce null se non è un link di gruppo valido. */
export function decodeResult(hash) {
  const h = String(hash || "").replace(/^#/, "");
  if (!h.startsWith(PREFIX) || h.length > 2000) return null;
  let o;
  try { o = JSON.parse(b64urlDecode(h.slice(PREFIX.length))); } catch { return null; }
  if (!o || o.v !== 1) return null;
  const { k, n, la, lo } = o;
  if (typeof k !== "string" || !/^[nwr]\d{1,15}$/.test(k)) return null;
  if (typeof n !== "string" || !n.trim() || n.length > 200) return null;
  if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  const zone = typeof o.z === "string" ? o.z.slice(0, 60) : "";
  return { key: k, n: n.trim(), lat: la, lon: lo, sushi: o.s === 1, take: false, a: "", h: "", t: "", w: "", zone };
}

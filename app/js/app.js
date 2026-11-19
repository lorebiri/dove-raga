// Interfaccia di «Dove raga?». Nessuna richiesta a servizi esterni: solo file statici dell'app.
import { fmtKm } from "./geo.js";
import { loadPlaces, findPlace } from "./data.js";
import { newSeed, pickPlace, inPlay } from "./pick.js";
import { shareUrl, decodeResult } from "./link.js";
import { prepareComuni, searchComuni, label, norm } from "./comuni.js";
import { renderCardBlob } from "./card.js";

const APP_URL_LABEL = "lorebiri.github.io/dove-raga";
const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* modalità privata */ } },
};
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let km = [2, 5, 10, 25].includes(store.get("km", 5)) ? store.get("km", 5) : 5;
let places = [], last = null, rolling = false, origin = null, rx = -24, ry = 32;
const excluded = new Set(store.get("excluded", []));

// ---------- dati ----------
async function fetchJson(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}
let indexP = null;
function getIndex() {
  indexP ??= fetchJson("data/index.json").then(ix => {
    if (ix.generated) {
      const d = new Date(ix.generated);
      if (!isNaN(d)) $("dataDate").textContent = ` (aggiornati al ${d.toLocaleDateString("it-IT")})`;
    }
    return ix;
  }).catch(e => { indexP = null; throw e; });
  return indexP;
}
let comuniP = null;
function getComuni() {
  comuniP ??= fetchJson("data/comuni.json").then(prepareComuni).catch(e => { comuniP = null; throw e; });
  return comuniP;
}

// ---------- dado ----------
const pipsMap = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
const cube = $("cube");
for (let f = 1; f <= 6; f++) {
  const d = document.createElement("span");
  d.className = "face f" + f + (f === 3 ? " top" : "");
  if (f !== 3) for (let c = 1; c <= 9; c++) { const s = document.createElement("span"); if (pipsMap[f].includes(c)) s.className = "pip"; d.appendChild(s); }
  cube.appendChild(d);
}
const faceRot = [[0, 0], [0, -90], [0, 90], [0, 180]];

function setStatus(t, err) { const s = $("status"); s.textContent = t; s.classList.toggle("err", !!err); }
function setHint(t) { $("hint").textContent = t; }
let toastTimer;
function toast(t) {
  const el = $("toast"); el.textContent = t; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

// ---------- raggio ----------
document.querySelectorAll("#radius button").forEach(b => {
  b.setAttribute("aria-pressed", String(+b.dataset.km === km));
  b.addEventListener("click", () => {
    km = +b.dataset.km; store.set("km", km);
    document.querySelectorAll("#radius button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    if (origin) search(origin);
  });
});

// ---------- posizione ----------
$("geo").addEventListener("click", () => {
  if (!("geolocation" in navigator)) { setStatus("Il telefono non condivide la posizione. Scrivete una città.", true); return; }
  setStatus("Cerco dove sei…");
  navigator.geolocation.getCurrentPosition(
    p => search({ lat: p.coords.latitude, lon: p.coords.longitude, label: "te", zone: "" }),
    e => setStatus(e.code === 1 ? "Posizione negata. Attivala nelle impostazioni o scrivi una città." : "Posizione non trovata. Scrivi una città.", true),
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
});

// ---------- città con suggerimenti ----------
const input = $("city"), sugg = $("sugg");
let options = [], active = -1;

function closeSugg() {
  sugg.hidden = true; sugg.innerHTML = ""; options = []; active = -1;
  input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant");
}
function setActive(i) {
  active = i;
  [...sugg.children].forEach((li, j) => li.setAttribute("aria-selected", String(j === i)));
  if (i >= 0) input.setAttribute("aria-activedescendant", `opt-${i}`); else input.removeAttribute("aria-activedescendant");
}
async function updateSugg() {
  const q = input.value;
  let list;
  try { list = await getComuni(); } catch { closeSugg(); return; }
  if (input.value !== q) return;
  options = searchComuni(list, q, 6);
  if (!options.length) { closeSugg(); return; }
  sugg.innerHTML = options.map((c, i) =>
    `<li role="option" id="opt-${i}" aria-selected="false">${esc(c.name)}${c.prov ? ` <small>${esc(c.prov)}</small>` : ""}</li>`).join("");
  sugg.hidden = false; input.setAttribute("aria-expanded", "true"); setActive(-1);
}
function choose(c) {
  input.value = label(c); closeSugg();
  search({ lat: c.lat, lon: c.lon, label: c.name, zone: c.name });
}
input.addEventListener("focus", () => { getComuni().catch(() => {}); });
input.addEventListener("input", updateSugg);
input.addEventListener("keydown", e => {
  if (e.key === "ArrowDown" && options.length) { e.preventDefault(); setActive((active + 1) % options.length); }
  else if (e.key === "ArrowUp" && options.length) { e.preventDefault(); setActive(active <= 0 ? options.length - 1 : active - 1); }
  else if (e.key === "Escape") { closeSugg(); }
  else if (e.key === "Enter" && active >= 0) { e.preventDefault(); choose(options[active]); }
});
input.addEventListener("blur", () => setTimeout(closeSugg, 150));
sugg.addEventListener("mousedown", e => e.preventDefault());
sugg.addEventListener("click", e => {
  const li = e.target.closest("li[role=option]");
  if (li) choose(options[+li.id.slice(4)]);
});
$("cityForm").addEventListener("submit", async e => {
  e.preventDefault();
  const q = input.value.trim(); if (!q) return;
  let list;
  try { list = await getComuni(); } catch { setStatus("Non riesco a caricare l'elenco dei comuni. Sei offline?", true); return; }
  const nq = norm(q.replace(/\s*\([A-Z]{2}\)\s*$/i, ""));
  const prov = (q.match(/\(([A-Z]{2})\)\s*$/i) || [])[1]?.toUpperCase();
  const hit = list.find(c => c.k === nq && (!prov || c.prov === prov)) || searchComuni(list, q, 1)[0];
  if (!hit) { setStatus(`«${q}» non lo trovo. Controlla come è scritto.`, true); return; }
  choose(hit);
});

// ---------- ricerca ----------
async function search(o) {
  origin = o;
  setStatus(`Cerco sushi entro ${km} km da ${o.label}…`);
  $("stage").disabled = true;
  try {
    places = await loadPlaces(fetchJson, await getIndex(), o.lat, o.lon, km);
  } catch {
    setStatus(navigator.onLine === false ? "Sei offline e questa zona non è in memoria. Riprova con la rete." : "Dati non caricati. Riprova tra poco.", true);
    return;
  }
  last = null; renderList();
  const n = inPlay(places, excluded).length;
  if (!places.length) {
    setStatus(`Zero sushi entro ${km} km da ${o.label}. Allargate il raggio.`, true);
    setHint("Niente da tirare qui"); return;
  }
  setStatus(`${places.length === 1 ? "1 posto" : places.length + " posti"} entro ${km} km da ${o.label}.`);
  $("stage").disabled = n === 0;
  setHint(n ? "Tocca il nigiri per tirare" : "Li avete scartati tutti. Esigenti.");
}

function renderList() {
  $("listBox").hidden = !places.length;
  $("count").textContent = inPlay(places, excluded).length;
  $("list").innerHTML = places.map((p, i) => {
    const out = excluded.has(p.key);
    return `<li class="${out ? "out" : ""}"><span class="n">${esc(p.n)} · ${fmtKm(p.d)}</span><button type="button" data-i="${i}" aria-label="${out ? "Rimetti" : "Escludi"} ${esc(p.n)}">${out ? "rimetti" : "escludi"}</button></li>`;
  }).join("");
}
$("list").addEventListener("click", e => {
  const b = e.target.closest("button[data-i]"); if (!b) return;
  const k = places[+b.dataset.i].key;
  excluded.has(k) ? excluded.delete(k) : excluded.add(k);
  store.set("excluded", [...excluded]);
  renderList();
  $("list").querySelector(`button[data-i="${b.dataset.i}"]`)?.focus();
  const n = inPlay(places, excluded).length;
  $("stage").disabled = !n;
  setHint(n ? "Tocca il nigiri per tirare" : "Li avete scartati tutti. Esigenti.");
});

// ---------- tiro ----------
function roll() {
  const pool = inPlay(places, excluded);
  if (rolling || !pool.length) return;
  rolling = true;
  const seed = newSeed();
  const pick = pickPlace(pool, seed, last?.key);
  last = pick;
  const [fx, fy] = faceRot[seed % 4];
  const extra = 2 + ((seed >>> 3) % 2);
  rx = Math.ceil(rx / 360) * 360 + 360 * extra + fx - 24;
  ry = Math.ceil(ry / 360) * 360 + 360 * extra + fy + 32;
  cube.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
  setHint("Il nigiri rotola…");
  if (navigator.vibrate && !reduceMotion()) try { navigator.vibrate(30); } catch { /* ignora */ }
  setTimeout(() => {
    show(pick, { zone: origin?.zone || "" });
    rolling = false;
    setHint("Non vi convince? Tocca per ritirare");
  }, reduceMotion() ? 50 : 1300);
}
$("stage").addEventListener("click", roll);

// ---------- risultato ----------
let current = null;
function mapsUrl(r) { return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.lat + "," + r.lon)}`; }

function show(r, { zone = "", group = false } = {}) {
  current = { place: r, zone };
  const el = $("result");
  const dist = Number.isFinite(r.d) ? fmtKm(r.d) : "";
  const web = r.w ? `<a href="${esc(r.w)}" target="_blank" rel="noopener">${esc(r.w.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, ""))}</a>` : "";
  const rows = [dist && ["Distanza", dist], r.a && ["Dove", esc(r.a)], r.h && ["Orari", esc(r.h)], r.t && ["Telefono", esc(r.t)], web && ["Sito", web]].filter(Boolean);
  el.innerHTML = `<div class="band"><b id="resultTitle">${group ? "Il gruppo ha deciso" : "Il dado ha parlato"}</b><span>${group ? (zone ? esc(zone) : "verdetto") : esc(dist)}</span></div>
    <span class="tag">${r.sushi ? "Sushi" : "Giapponese"}${r.take ? " · asporto" : ""}</span>
    <h2 id="placeName" tabindex="-1">${esc(r.n)}</h2>
    ${rows.length ? `<dl class="meta">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>` : ""}
    <div class="actions">
      <a class="btn primary" href="${mapsUrl(r)}" target="_blank" rel="noopener">Portami lì</a>
      ${r.t ? `<a class="btn ghost" href="tel:${esc(r.t.replace(/[^\d+]/g, ""))}">Chiama</a>` : ""}
      ${group ? `<button class="btn ghost" type="button" id="again">Tira anche tu</button>` : `<button class="btn ghost" type="button" id="skip">Nah, ritira</button>`}
    </div>
    <div class="actions share">
      <button class="btn salmon" type="button" id="shareLink">Manda al gruppo</button>
      <button class="btn ghost" type="button" id="shareCard">Cartolina per le storie</button>
    </div>`;
  el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
  $("skip")?.addEventListener("click", () => {
    excluded.add(r.key); store.set("excluded", [...excluded]); renderList();
    if (inPlay(places, excluded).length) roll();
    else { $("stage").disabled = true; setHint("Li avete scartati tutti. Esigenti."); setStatus("Avete escluso tutto. Rimettete qualcosa dalla lista.", true); }
  });
  $("again")?.addEventListener("click", () => {
    history.replaceState(null, "", location.pathname + location.search);
    $("geo").focus();
    setStatus("Dite dove siete, poi tirate il dado.");
  });
  $("shareLink").addEventListener("click", shareLink);
  $("shareCard").addEventListener("click", shareCard);
  setStatus(`${group ? "Il gruppo ha deciso" : "Il dado ha scelto"}: ${r.n}${dist ? ", a " + dist : ""}.`);
}

function link() { return shareUrl(location.href, current.place, current.zone); }

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

async function shareLink() {
  if (!current) return;
  const url = link();
  const text = `Il dado ha deciso: ${current.place.n}. Si va lì.`;
  if (navigator.share) {
    try { await navigator.share({ title: "Dove raga?", text, url }); return; }
    catch (e) { if (e.name === "AbortError") return; }
  }
  toast(await copy(url) ? "Link copiato: incollalo nel gruppo" : "Copia questo link: " + url);
}

async function shareCard() {
  if (!current) return;
  const btn = $("shareCard"); btn.disabled = true;
  try {
    const r = current.place;
    const blob = await renderCardBlob(document, {
      name: r.n, dist: Number.isFinite(r.d) ? fmtKm(r.d) : "", kind: r.sushi ? "Sushi" : "Giapponese", url: APP_URL_LABEL,
    });
    const file = new File([blob], "dove-raga.png", { type: "image/png" });
    const url = link();
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Dove raga?", text: `Il dado ha deciso: ${r.n} ${url}` }); return; }
      catch (e) { if (e.name === "AbortError") return; }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "dove-raga.png";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    toast(await copy(url) ? "Cartolina scaricata e link copiato" : "Cartolina scaricata");
  } catch {
    toast("Cartolina non riuscita, riprova");
  } finally { btn.disabled = false; }
}

// ---------- link di gruppo ----------
async function openGroupLink() {
  const g = decodeResult(location.hash);
  if (!g) return;
  show(g, { zone: g.zone, group: true });
  $("placeName")?.focus();
  try {
    const full = await findPlace(fetchJson, await getIndex(), g.key, g.lat, g.lon);
    if (full && current?.place.key === g.key) show(full, { zone: g.zone, group: true });
  } catch { /* restano i dati del link */ }
}
window.addEventListener("hashchange", openGroupLink);
openGroupLink();
getIndex().catch(() => {});

if ("serviceWorker" in navigator && location.protocol === "https:" || location.hostname === "localhost") {
  window.addEventListener("load", () => navigator.serviceWorker?.register("sw.js").catch(() => {}));
}

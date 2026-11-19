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
let places = [], last = null, rolling = false, origin = null;
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

// ---------- messaggi ----------
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
    $("pill").textContent = "";
    setStatus(`Zero sushi entro ${km} km da ${o.label}. Allargate il raggio.`, true);
    setHint("Niente da tirare qui"); return;
  }
  setStatus(`${places.length === 1 ? "1 posto" : places.length + " posti"} entro ${km} km da ${o.label}.`);
  $("pill").textContent = `${n} nel dado`;
  $("stage").disabled = n === 0;
  setHint(n ? "Tocca il nigiri per tirare" : "Li avete scartati tutti. Esigenti.");
}

function renderList() {
  $("listBox").hidden = !places.length;
  $("count").textContent = inPlay(places, excluded).length;
  if (places.length) $("pill").textContent = `${inPlay(places, excluded).length} nel dado`;
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
  const stage = $("stage");
  stage.classList.remove("rolling"); void stage.offsetWidth; stage.classList.add("rolling");
  setHint("Il nigiri rotola…");
  if (navigator.vibrate && !reduceMotion()) try { navigator.vibrate(30); } catch { /* ignora */ }
  setTimeout(() => {
    show(pick, { zone: origin?.zone || "" });
    rolling = false;
    setHint("Non vi convince? Tocca per ritirare");
    stage.classList.remove("rolling");
  }, reduceMotion() ? 50 : 900);
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
  const rows = [r.a && ["Dove", esc(r.a)], r.h && ["Orari", esc(r.h)], r.t && ["Tel", esc(r.t)], web && ["Sito", web]].filter(Boolean);
  const tags = [`<span class="tag">${r.sushi ? "🍣 sushi" : "🍜 giapponese"}</span>`, dist && `<span class="tag m">📍 ${esc(dist)}</span>`, r.take && `<span class="tag w">asporto</span>`].filter(Boolean);
  el.innerHTML = `<img class="who" src="mascotte.svg" alt="">
    <span class="lbl" id="resultTitle">${group ? "Il gruppo ha deciso" : "il dado ha deciso"}${group && zone ? `<span>${esc(zone)}</span>` : ""}</span>
    <h2 id="placeName" tabindex="-1">${esc(r.n)}</h2>
    <div class="tags">${tags.join("")}</div>
    ${rows.length ? `<dl class="meta">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>` : ""}
    <div class="grid2">
      <a class="btn blue" href="${mapsUrl(r)}" target="_blank" rel="noopener">Portami lì</a>
      ${group ? `<button class="btn" type="button" id="again">Tira anche tu</button>` : `<button class="btn" type="button" id="skip">Nah, ritira</button>`}
      ${r.t ? `<a class="btn" href="tel:${esc(r.t.replace(/[^\d+]/g, ""))}" style="grid-column:1/-1">📞 Chiama</a>` : ""}
    </div>`;
  el.classList.add("done");
  el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
  $("share").hidden = false;
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
  setStatus(`${group ? "Il gruppo ha deciso" : "Il dado ha scelto"}: ${r.n}${dist ? ", a " + dist : ""}.`);
}
$("shareLink").addEventListener("click", () => shareLink());
$("shareCard").addEventListener("click", () => shareCard());

function link() { return shareUrl(location.href, current.place, current.zone); }

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

async function shareLink() {
  if (!current) return;
  const url = link();
  const text = `il dado ha deciso: ${current.place.n}. non si discute 🤝`;
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
    }, "mascotte.svg");
    const file = new File([blob], "dove-raga.png", { type: "image/png" });
    const url = link();
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Dove raga?", text: `il dado ha deciso: ${r.n} ${url}` }); return; }
      catch (e) { if (e.name === "AbortError") return; }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "dove-raga.png";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    toast(await copy(url) ? "Sticker scaricato e link copiato" : "Sticker scaricato");
  } catch {
    toast("Sticker non riuscito, riprova");
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

// Ricerca dei comuni nell'elenco statico (app/data/comuni.json).
// Formato del file: { v, generated, c: [[nome, lat, lon, sigla, abitanti], ...] }

/** Minuscole, senza accenti né apostrofi, spazi singoli. */
export function norm(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`´.\-/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Prepara l'elenco per la ricerca. */
export function prepareComuni(json) {
  const rows = json && Array.isArray(json.c) ? json.c : [];
  return rows
    .filter(r => Array.isArray(r) && typeof r[0] === "string" && Number.isFinite(r[1]) && Number.isFinite(r[2]))
    .map(([name, lat, lon, prov = "", pop = 0]) => ({ name, lat, lon, prov, pop: pop || 0, k: norm(name) }));
}

/**
 * Suggerimenti per il testo scritto: prima i nomi che iniziano così,
 * poi quelli con una parola che inizia così; a parità, i comuni più popolosi.
 */
export function searchComuni(list, q, limit = 6) {
  const nq = norm(q);
  if (!nq) return [];
  const scored = [];
  for (const c of list) {
    let s;
    if (c.k === nq) s = 0;
    else if (c.k.startsWith(nq)) s = 1;
    else if (c.k.includes(" " + nq)) s = 2;
    else continue;
    scored.push([s, c]);
  }
  scored.sort((a, b) => a[0] - b[0] || b[1].pop - a[1].pop || a[1].name.localeCompare(b[1].name, "it"));
  return scored.slice(0, limit).map(x => x[1]);
}

/** Etichetta mostrata: "Nome (SIGLA)". */
export function label(c) {
  return c.prov ? `${c.name} (${c.prov})` : c.name;
}

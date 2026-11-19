// Logica del tiro: generatore pseudo-casuale con seme e scelta del locale.

/** Generatore mulberry32: stesso seme, stessa sequenza. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seme nuovo a 32 bit. */
export function newSeed() {
  const c = globalThis.crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0];
  return Math.floor(Math.random() * 2 ** 32) >>> 0;
}

/** Locali ancora in gioco (non esclusi). */
export function inPlay(places, excluded) {
  return places.filter(p => !excluded.has(p.key));
}

/**
 * Sceglie un locale dal mazzo. Se possibile evita di ripetere
 * quello uscito al tiro precedente (lastKey).
 */
export function pickPlace(pool, seed, lastKey = null) {
  if (!pool.length) return null;
  const cand = pool.length > 1 && lastKey ? pool.filter(p => p.key !== lastKey) : pool;
  const r = rng(seed)();
  return cand[Math.floor(r * cand.length)];
}

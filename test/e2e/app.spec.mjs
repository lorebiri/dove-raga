import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { useFixtureData, MILANO, NAMES, pngSize } from "./helpers.mjs";

test.use({ geolocation: MILANO, permissions: ["geolocation"] });

async function rollFromHere(page) {
  await page.getByRole("button", { name: "Usa la mia posizione" }).click();
  await expect(page.getByRole("status").first()).toContainText("posti entro 5 km da te");
  const dice = page.getByRole("button", { name: "Tira il dado" });
  await expect(dice).toBeEnabled();
  await dice.click();
  const name = page.locator("#placeName");
  await expect(name).toBeVisible();
  return (await name.textContent()).trim();
}

test("si apre senza richieste esterne, con titolo e attribuzione OSM", async ({ page }) => {
  const external = await useFixtureData(page);
  await page.goto("./");
  await expect(page).toHaveTitle(/Dove raga\?/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dove raga?");
  await expect(page.getByRole("link", { name: "contributori OpenStreetMap" })).toBeVisible();
  await expect(page.locator("#dataDate")).toContainText("16/11/2026");
  await rollFromHere(page);
  expect(external).toEqual([]);
  const cookies = await page.context().cookies();
  expect(cookies).toEqual([]);
});

test("posizione → tiro → risultato con dettagli", async ({ page }) => {
  await useFixtureData(page);
  await page.goto("./");
  const name = await rollFromHere(page);
  expect(NAMES).toContain(name);
  await expect(page.locator("#result .meta")).toContainText("Distanza");
  await expect(page.getByRole("link", { name: "Portami lì" })).toHaveAttribute("href", /google\.com\/maps/);
  await expect(page.locator("#status")).toContainText(`Il dado ha scelto: ${name}`);
});

test("città con suggerimenti da tastiera", async ({ page }) => {
  await useFixtureData(page);
  await page.goto("./");
  const box = page.getByRole("combobox", { name: "Città o comune" });
  await box.fill("mil");
  await expect(page.getByRole("option")).toHaveCount(1);
  await box.press("ArrowDown");
  await expect(box).toHaveAttribute("aria-activedescendant", "opt-0");
  await box.press("Enter");
  await expect(box).toHaveValue("Milano (MI)");
  await expect(page.locator("#status")).toContainText("posti entro 5 km da Milano");
});

test("città scritta e inviata senza scegliere; città inesistente", async ({ page }) => {
  await useFixtureData(page);
  await page.goto("./");
  const box = page.getByRole("combobox", { name: "Città o comune" });
  await box.fill("Roma");
  await box.press("Escape");
  await page.getByRole("button", { name: "Vai" }).click();
  await expect(page.locator("#status")).toContainText("1 posto entro 5 km da Roma");
  await box.fill("Paperopoli");
  await page.getByRole("button", { name: "Vai" }).click();
  await expect(page.locator("#status")).toContainText("non lo trovo");
});

test("raggio piccolo senza locali e cambio raggio", async ({ page }) => {
  await useFixtureData(page);
  await page.context().setGeolocation({ latitude: 45.3, longitude: 9.0 });
  await page.goto("./");
  await page.getByRole("button", { name: "2 km" }).click();
  await page.getByRole("button", { name: "Usa la mia posizione" }).click();
  await expect(page.locator("#status")).toContainText("Zero sushi entro 2 km");
  await expect(page.getByRole("button", { name: "Tira il dado" })).toBeDisabled();
  await page.getByRole("button", { name: "25 km" }).click();
  await expect(page.locator("#status")).toContainText("entro 25 km");
  await expect(page.getByRole("button", { name: "Tira il dado" })).toBeEnabled();
});

test("Nah, ritira: esclude e sceglie un altro", async ({ page }) => {
  await useFixtureData(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  const first = await rollFromHere(page);
  await page.getByRole("button", { name: "Nah, ritira" }).click();
  await expect(page.locator("#placeName")).not.toHaveText(first);
  await page.locator("#listBox summary").click();
  await expect(page.locator("#list li.out")).toContainText(first);
  await expect(page.getByRole("button", { name: `Rimetti ${first}` })).toBeVisible();
});

test("tastiera: si tira con Invio sul dado", async ({ page }) => {
  await useFixtureData(page);
  await page.goto("./");
  await page.getByRole("button", { name: "Usa la mia posizione" }).click();
  const dice = page.getByRole("button", { name: "Tira il dado" });
  await expect(dice).toBeEnabled();
  await dice.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#placeName")).toBeVisible();
});

test("movimento ridotto: risultato quasi immediato", async ({ page }) => {
  await useFixtureData(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  await page.getByRole("button", { name: "Usa la mia posizione" }).click();
  await expect(page.getByRole("button", { name: "Tira il dado" })).toBeEnabled();
  const t0 = Date.now();
  await page.getByRole("button", { name: "Tira il dado" }).click();
  await expect(page.locator("#placeName")).toBeVisible({ timeout: 1000 });
  expect(Date.now() - t0).toBeLessThan(1000);
});

test("modalità gruppo: il link mostra lo stesso esito agli amici", async ({ page, context, browser }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await useFixtureData(page);
  await page.addInitScript(() => { delete Navigator.prototype.share; delete Navigator.prototype.canShare; });
  await page.goto("./");
  const name = await rollFromHere(page);
  await page.getByRole("button", { name: "Manda al gruppo" }).click();
  await expect(page.locator("#toast")).toContainText("Link copiato");
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/\/dove-raga\/#g=/);
  expect(url).not.toContain("45.4642"); // niente posizione di chi tira

  const friend = await browser.newContext({ ...test.info().project.use, serviceWorkers: "block" });
  const fp = await friend.newPage();
  await useFixtureData(fp);
  await fp.goto(url);
  await expect(fp.locator("#resultTitle")).toHaveText("Il gruppo ha deciso");
  await expect(fp.locator("#placeName")).toHaveText(name);
  await expect(fp.getByRole("link", { name: "Portami lì" })).toBeVisible();
  await fp.getByRole("button", { name: "Tira anche tu" }).click();
  expect(new URL(fp.url()).hash).toBe("");
  await friend.close();
});

test("link di gruppo manomesso: nessun HTML eseguito", async ({ page }) => {
  await useFixtureData(page);
  const evil = Buffer.from(JSON.stringify({ v: 1, k: "n1", n: "<img src=x onerror=window.pwned=1>", la: 45.4, lo: 9.1 })).toString("base64url");
  await page.goto("./#g=" + evil);
  await expect(page.locator("#placeName")).toHaveText("<img src=x onerror=window.pwned=1>");
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();
  await expect(page.locator("#result img")).toHaveCount(0);
});

test("cartolina 9:16: scaricata come PNG 1080×1920 e link copiato", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await useFixtureData(page);
  await page.addInitScript(() => { delete Navigator.prototype.share; delete Navigator.prototype.canShare; });
  await page.goto("./");
  await rollFromHere(page);
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Cartolina per le storie" }).click();
  const download = await dl;
  expect(download.suggestedFilename()).toBe("dove-raga.png");
  const buf = await readFile(await download.path());
  expect(pngSize(buf)).toEqual({ width: 1080, height: 1920 });
  await expect(page.locator("#toast")).toContainText("Cartolina scaricata");
});

test("cartolina: usa la condivisione di sistema quando c'è", async ({ page }) => {
  await useFixtureData(page);
  await page.addInitScript(() => {
    window.__shared = null;
    Navigator.prototype.canShare = d => !!d.files;
    Navigator.prototype.share = async d => { window.__shared = { n: d.files?.length, type: d.files?.[0]?.type, size: d.files?.[0]?.size, text: d.text }; };
  });
  await page.goto("./");
  const name = await rollFromHere(page);
  await page.getByRole("button", { name: "Cartolina per le storie" }).click();
  await expect.poll(() => page.evaluate(() => window.__shared)).not.toBeNull();
  const s = await page.evaluate(() => window.__shared);
  expect(s.n).toBe(1);
  expect(s.type).toBe("image/png");
  expect(s.size).toBeGreaterThan(20000);
  expect(s.text).toContain(name);
});

test("accessibilità: nessuna violazione grave (axe)", async ({ page }) => {
  await useFixtureData(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  let r = await new AxeBuilder({ page }).analyze();
  expect(r.violations.filter(v => ["serious", "critical"].includes(v.impact)).map(v => v.id)).toEqual([]);
  await rollFromHere(page);
  r = await new AxeBuilder({ page }).analyze();
  expect(r.violations.filter(v => ["serious", "critical"].includes(v.impact)).map(v => v.id)).toEqual([]);
});

test("accessibilità: anche col tema scuro", async ({ page }) => {
  await useFixtureData(page);
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("./");
  await rollFromHere(page);
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations.filter(v => ["serious", "critical"].includes(v.impact)).map(v => v.id)).toEqual([]);
});

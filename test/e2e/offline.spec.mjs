import { test, expect } from "@playwright/test";
import { useFixtureData } from "./helpers.mjs";

test.use({ serviceWorkers: "allow" });

test("offline: l'interfaccia si riapre senza rete", async ({ page, context }) => {
  await page.goto("./");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dove raga?");
  await expect(page.getByRole("button", { name: "Tira il dado" })).toBeVisible();
  const font = await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('40px "Dela Gothic One"'); });
  expect(font).toBe(true);
});

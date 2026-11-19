import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT || 4173);
export default defineConfig({
  testDir: "test/e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}/dove-raga/`,
    trace: "off",
    serviceWorkers: "block",
    locale: "it-IT",
    timezoneId: "Europe/Rome",
  },
  projects: [
    { name: "telefono", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `node scripts/serve.mjs`,
    env: { PORT: String(PORT) },
    url: `http://localhost:${PORT}/dove-raga/`,
    reuseExistingServer: !process.env.CI,
  },
});

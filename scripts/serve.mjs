#!/usr/bin/env node
// Piccolo server statico per sviluppo e test: serve app/ su http://localhost:PORT/dove-raga/
// (stesso percorso di GitHub Pages).
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", process.env.SITE_DIR || "app");
const PORT = Number(process.env.PORT || 4173);
const BASE = "/dove-raga/";
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
};

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path === "/" || path === "/dove-raga") { res.writeHead(302, { Location: BASE }); return res.end(); }
  if (!path.startsWith(BASE)) { res.writeHead(404); return res.end("not found"); }
  let file = normalize(join(ROOT, path.slice(BASE.length)));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(body);
  } catch {
    res.writeHead(404); res.end("not found");
  }
}).listen(PORT, () => console.log(`Dove raga? su http://localhost:${PORT}${BASE}`));

#!/usr/bin/env node
/**
 * Sovereign Portal C-137 — ship the static website into dist/website.
 *
 * The portal has zero build tooling: this step simply copies the authored
 * source of `apps/web-portal` into the distributable directory and verifies
 * that the mandatory PWA surface is present.
 */

import { cp, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const SRC = path.join(ROOT, "apps", "web-portal");
const OUT = path.join(ROOT, "dist", "website");

const REQUIRED = [
  "index.html",
  "offline.html",
  "manifest.webmanifest",
  "sw.js",
  "robots.txt",
  "nginx.conf",
  "Dockerfile",
  "vercel.json",
  "netlify.toml",
  "_headers",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
];

async function walk(dir, base = dir, acc = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, base, acc);
    else acc.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return acc;
}

async function sha256(file) {
  const buf = await readFile(file);
  return createHash("sha256").update(buf).digest("hex");
}

async function main() {
  if (!existsSync(SRC)) {
    console.error(`[portal] source directory missing: ${SRC}`);
    process.exit(1);
  }

  await mkdir(OUT, { recursive: true });
  await cp(SRC, OUT, { recursive: true, force: true });
  console.log(`[portal] copied ${path.relative(ROOT, SRC)} -> ${path.relative(ROOT, OUT)}`);

  const missing = REQUIRED.filter((rel) => !existsSync(path.join(OUT, rel)));
  if (missing.length) {
    console.error(`[portal] FAIL missing required files: ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log(`[portal] OK all ${REQUIRED.length} required files present`);

  const indexHtml = await readFile(path.join(OUT, "index.html"), "utf8");
  const checks = [
    ["portal vortex shader", /u_resonance/],
    ["matrix rain layer", /matrix-canvas/],
    ["orchestrator HUD", /ORCHESTRATOR ONLINE/],
    ["SOE gateway bridge", /\/health/],
    ["PWA service worker registration", /serviceWorker\.register/],
  ];
  for (const [label, re] of checks) {
    if (!re.test(indexHtml)) {
      console.error(`[portal] FAIL index.html is missing: ${label}`);
      process.exit(1);
    }
    console.log(`[portal] OK index.html contains ${label}`);
  }

  const files = (await walk(OUT)).sort();
  const manifest = [];
  for (const rel of files) {
    const full = path.join(OUT, rel);
    const s = await stat(full);
    manifest.push(`${await sha256(full)}  ${rel}  (${s.size} bytes)`);
  }

  const totalBytes = manifest.reduce((sum, line) => {
    const m = /\((\d+) bytes\)$/.exec(line);
    return sum + (m ? Number(m[1]) : 0);
  }, 0);

  await writeFile(
    path.join(ROOT, "dist", "website.SHA256.txt"),
    manifest.join("\n") + "\n",
    "utf8"
  );

  console.log(`[portal] ${files.length} files, ${totalBytes} bytes`);
  console.log(`[portal] checksums -> dist/website.SHA256.txt`);
  console.log(`[portal] serve with:  python -m http.server 8080 --directory dist/website`);
}

main().catch((err) => {
  console.error("[portal] FAILED:", err);
  process.exit(1);
});

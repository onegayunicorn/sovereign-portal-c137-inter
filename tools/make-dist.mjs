#!/usr/bin/env node
/**
 * Sovereign Portal C-137 — assemble and audit the dist/ artifact tree.
 *
 * Verifies which shippable artifacts exist (website, Windows .exe, Android
 * .apk, PWA bundle, PAF package) and writes dist/ARTIFACTS.md plus a global
 * checksum manifest. Never fabricates an artifact: a missing target is
 * reported as MISSING rather than silently skipped.
 */

import { readdir, stat, mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const DIST = path.join(ROOT, "dist");

const TARGETS = [
  { id: "website", label: "Static website (portal)", rel: "website", kind: "dir", required: true },
  { id: "pwa", label: "React PWA bundle", rel: "pwa", kind: "dir", required: false },
  { id: "exe", label: "Windows executable", rel: "windows/SovereignPortalC137.exe", kind: "file", required: true },
  { id: "apk", label: "Android package", rel: "android/SovereignPortalC137.apk", kind: "file", required: true },
  { id: "paf", label: "PortableApps (PAF) bundle", rel: "portable", kind: "dir", required: false },
];

async function walk(dir, base = dir, acc = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, base, acc);
    else acc.push({ rel: path.relative(base, full).split(path.sep).join("/"), full });
  }
  return acc;
}

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

function human(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function measure(abs, kind) {
  if (!existsSync(abs)) return null;
  if (kind === "file") {
    const s = await stat(abs);
    return { files: 1, bytes: s.size, hash: await sha256(abs) };
  }
  const entries = await walk(abs);
  let bytes = 0;
  for (const e of entries) bytes += (await stat(e.full)).size;
  return { files: entries.length, bytes, hash: null };
}

async function main() {
  await mkdir(DIST, { recursive: true });

  const rows = [];
  let requiredMissing = 0;

  for (const t of TARGETS) {
    const abs = path.join(DIST, t.rel);
    const info = await measure(abs, t.kind);
    if (!info) {
      if (t.required) requiredMissing++;
      rows.push({ ...t, status: "MISSING", files: 0, bytes: 0, hash: null });
      console.log(`[dist] MISSING  ${t.label}  (${t.rel})`);
    } else {
      rows.push({ ...t, status: "OK", ...info });
      console.log(`[dist] OK       ${t.label}  ${info.files} file(s)  ${human(info.bytes)}`);
    }
  }

  const manifest = [];
  for (const row of rows) {
    if (row.status !== "OK") continue;
    manifest.push(`# ${row.label}`);
    if (row.hash) {
      manifest.push(`${row.hash}  ${row.rel}  (${row.bytes} bytes)`);
    } else {
      for (const e of await walk(path.join(DIST, row.rel))) {
        const s = await stat(e.full);
        manifest.push(`${await sha256(e.full)}  ${row.rel}/${e.rel}  (${s.size} bytes)`);
      }
    }
    manifest.push("");
  }

  await writeFile(path.join(DIST, "SHA256SUMS.txt"), manifest.join("\n"), "utf8");

  const md = [
    "# Sovereign Portal C-137 — build artifacts",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "| Artifact | Path | Status | Files | Size |",
    "|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.label} | \`dist/${r.rel}\` | ${r.status === "OK" ? "built" : "**NOT BUILT**"} | ${r.files} | ${human(r.bytes)} |`
    ),
    "",
    "Checksums: `dist/SHA256SUMS.txt`",
    "",
  ].join("\n");

  await writeFile(path.join(DIST, "ARTIFACTS.md"), md, "utf8");

  console.log("");
  console.log(`[dist] wrote dist/ARTIFACTS.md and dist/SHA256SUMS.txt`);
  if (requiredMissing) {
    console.log(`[dist] ${requiredMissing} required artifact(s) still missing`);
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error("[dist] FAILED:", err);
  process.exit(1);
});

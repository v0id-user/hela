#!/usr/bin/env bun
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Build-time static asset prep for the hosted frontends.
 *
 * - emits `version.json` for `web` and `app`
 * - mirrors canonical wire schemas into `apps/web/public/schemas/wire/`
 *
 * The source of truth stays in `packages/schemas/`; this script only stages
 * files into Vite's `public/` area before a production build.
 */

import { mkdir, readdir, rm, copyFile, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(import.meta.dir, "..");
const TEMP_SCHEMA_BASE = "https://web-production-f24fc.up.railway.app/schemas/wire/";
const target = Bun.argv[2];

if (target !== "web" && target !== "app") {
  console.error("usage: bun run scripts/prepare_static_assets.ts <web|app>");
  process.exit(1);
}

type Target = "web" | "app";

function envFirst(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function gitOutput(...args: string[]): string | undefined {
  const result = spawnSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  if (result.status !== 0) return undefined;
  const value = result.stdout.trim();
  return value || undefined;
}

async function packageVersion(app: Target): Promise<string> {
  const raw = await readFile(join(ROOT, "apps", app, "package.json"), "utf8");
  const pkg = JSON.parse(raw) as { version?: string };
  return pkg.version ?? "0.0.0";
}

async function commitFromFile(): Promise<string | undefined> {
  // CI writes a plain `COMMIT` file at repo root before `railway up`
  // so the Dockerfile can COPY it in. That covers the case where
  // Railway doesn't forward `RAILWAY_GIT_COMMIT_SHA` as a build ARG
  // (`railway up --detach` path, notably).
  try {
    const value = (await readFile(join(ROOT, "COMMIT"), "utf8")).trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

async function writeVersionFile(app: Target): Promise<void> {
  const publicDir = join(ROOT, "apps", app, "public");
  const commit =
    envFirst("RAILWAY_GIT_COMMIT_SHA", "SOURCE_VERSION", "GITHUB_SHA") ??
    (await commitFromFile()) ??
    gitOutput("rev-parse", "HEAD");
  const payload: Record<string, string | boolean> = {
    ok: true,
    service: app,
    version: await packageVersion(app),
    built_at: new Date().toISOString(),
  };

  if (commit) payload.commit = commit;
  if (app === "web") payload.schema_base = TEMP_SCHEMA_BASE;

  await mkdir(publicDir, { recursive: true });
  await writeFile(join(publicDir, "version.json"), JSON.stringify(payload, null, 2) + "\n");
}

async function syncWireSchemas(): Promise<void> {
  const sourceDir = join(ROOT, "packages", "schemas", "wire");
  const destDir = join(ROOT, "apps", "web", "public", "schemas", "wire");

  await rm(destDir, { recursive: true, force: true });
  await mkdir(destDir, { recursive: true });

  for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".schema.json")) continue;
    await copyFile(join(sourceDir, entry.name), join(destDir, entry.name));
  }
}

await writeVersionFile(target);
if (target === "web") await syncWireSchemas();

const versionPath = join("apps", target, "public", "version.json");
console.log(`wrote ${versionPath}`);
if (target === "web") {
  console.log(`synced ${join("apps", "web", "public", "schemas", "wire")}`);
}

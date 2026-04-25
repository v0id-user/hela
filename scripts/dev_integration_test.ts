#!/usr/bin/env bun
// Dev environment integration test. Spec: docs/dev/dev-env-integration.md
//
// Exercises auth + billing wiring end to end against the *dev* Railway
// environment and the *sandbox* Polar org. Run before any PR to main
// that touches auth or billing. Reads required inputs from .env.local
// at the repo root.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

type Status = "pass" | "fail";
interface Case {
  name: string;
  status: Status;
  reason: string;
}

const REPO_ROOT = new URL("..", import.meta.url).pathname;
const ENV_FILE = join(REPO_ROOT, ".env.local");

function loadEnvLocal(): Record<string, string> {
  if (!existsSync(ENV_FILE)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(ENV_FILE, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

function require(env: Record<string, string>, key: string): string {
  const v = process.env[key] ?? env[key];
  if (!v) {
    console.error(`missing env: ${key}. add it to .env.local or the shell.`);
    process.exit(2);
  }
  return v;
}

const env = loadEnvLocal();
const CONTROL_URL = require(env, "DEV_CONTROL_URL").replace(/\/$/, "");
const POLAR_TOKEN =
  process.env.DEV_POLAR_ACCESS_TOKEN ??
  env.DEV_POLAR_ACCESS_TOKEN ??
  env.SANDBOX_POLAR_ACCESS_TOKEN ??
  "";
if (!POLAR_TOKEN) {
  console.error("missing env: DEV_POLAR_ACCESS_TOKEN (or SANDBOX_POLAR_ACCESS_TOKEN). add to .env.local.");
  process.exit(2);
}
const POLAR_BASE = "https://sandbox-api.polar.sh";

// Polar's email validator rejects RFC 2606 special-use TLDs (.test,
// .example, .invalid, .localhost). Use a real gTLD the user owns so
// the customer create call passes validation.
const email = `dev-it-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@hela.dev`;
const password = `boring-${crypto.randomUUID().slice(0, 16)}`;

console.log(`> dev env: ${CONTROL_URL}`);
console.log(`> test user: ${email}`);

const cases: Case[] = [];
const ok = (name: string, reason = "") => cases.push({ name, status: "pass", reason });
const bad = (name: string, reason: string) => cases.push({ name, status: "fail", reason });

// Naive cookie jar: capture the first Set-Cookie pair, replay on requests.
let cookie = "";
function capture(res: Response) {
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
}
function authed(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("Cookie", cookie);
  return { ...init, headers };
}

interface Account {
  id: string;
  email: string;
  polar_customer_id: string | null;
  github_id: string | null;
}

let account: Account | null = null;

// ── case 1: signup creates a control plane account ──────────────────────
{
  const res = await fetch(`${CONTROL_URL}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  capture(res);
  if (res.status === 200) {
    const body = (await res.json()) as { account: Account };
    account = body.account;
    if (account.email === email) ok("signup creates a control plane account", `id=${account.id}`);
    else bad("signup creates a control plane account", `email mismatch ${account.email}`);
  } else {
    const body = await res.text();
    bad("signup creates a control plane account", `status=${res.status} body=${body.slice(0, 120)}`);
  }
}

// ── case 2: signup creates a Polar customer in sandbox ──────────────────
if (account?.polar_customer_id) {
  const res = await fetch(`${POLAR_BASE}/v1/customers/${account.polar_customer_id}`, {
    headers: { Authorization: `Bearer ${POLAR_TOKEN}` },
  });
  if (res.status === 200) {
    const body = (await res.json()) as { email: string };
    if (body.email === email) ok("polar customer created in sandbox", `id=${account.polar_customer_id}`);
    else bad("polar customer created in sandbox", `polar email ${body.email} != signup email`);
  } else {
    bad("polar customer created in sandbox", `polar GET /customers/{id} status=${res.status}`);
  }
} else {
  bad(
    "polar customer created in sandbox",
    account ? "account.polar_customer_id is null (control did not call Polar)" : "no account",
  );
}

// ── case 3: /api/me returns the account with the session cookie ─────────
{
  const res = await fetch(`${CONTROL_URL}/api/me`, authed());
  if (res.status === 200) {
    const body = (await res.json()) as { account: Account };
    if (body.account.email === email) ok("/api/me returns the account", `200`);
    else bad("/api/me returns the account", `email mismatch ${body.account.email}`);
  } else {
    bad("/api/me returns the account", `status=${res.status}`);
  }
}

// ── case 4: wrong password returns 401 ──────────────────────────────────
{
  const res = await fetch(`${CONTROL_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "wrongpassword-totally" }),
  });
  if (res.status === 401) ok("wrong password returns 401", "401");
  else bad("wrong password returns 401", `status=${res.status}`);
}

// ── case 5: right password returns 200 ──────────────────────────────────
{
  const res = await fetch(`${CONTROL_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  capture(res);
  if (res.status === 200) ok("right password returns 200", "200");
  else bad("right password returns 200", `status=${res.status}`);
}

// ── case 6: logout returns 200 and clears the session cookie ────────────
//
// Phoenix uses signed cookie-based sessions (no server-side store), so
// the server cannot revoke a previously-issued cookie. "Logout" means
// the response Set-Cookie clears the cookie on the client. We assert
// that contract: 200 + Set-Cookie that resets _control_key to empty
// (the indication Plug.Session uses for `configure_session(drop: true)`).
// True server-side revocation would require a Redis or DB session
// store — out of scope for the current cookie-store design.
{
  const out = await fetch(`${CONTROL_URL}/auth/logout`, { method: "POST", ...authed() });
  const sc = out.headers.get("set-cookie") ?? "";
  const cleared = /_control_key=(""|;|$)/.test(sc) || /max-age=0/i.test(sc) || /expires=Thu, 01 Jan 1970/i.test(sc);
  if (out.status === 200 && cleared) ok("logout returns 200 and clears the cookie", "200 + clear");
  else bad("logout returns 200 and clears the cookie", `status=${out.status} set-cookie=${sc.slice(0, 80)}`);
}

// ── cleanup: delete the sandbox Polar customer ──────────────────────────
let cleanup = "no cleanup needed";
if (account?.polar_customer_id) {
  const res = await fetch(`${POLAR_BASE}/v1/customers/${account.polar_customer_id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${POLAR_TOKEN}` },
  });
  cleanup =
    res.status >= 200 && res.status < 300
      ? `polar customer ${account.polar_customer_id} deleted`
      : `polar DELETE failed (${res.status}); manual cleanup: ${account.polar_customer_id}`;
}
// Control DB cleanup is not implemented — no admin endpoint exists yet.
// Dev DB is not a long lived data store.

// ── report ──────────────────────────────────────────────────────────────
console.log("");
const w = Math.max(...cases.map((c) => c.name.length));
for (const c of cases) {
  const tag = c.status === "pass" ? "pass" : "FAIL";
  console.log(`  ${tag}  ${c.name.padEnd(w)}  ${c.reason}`);
}
console.log("");
console.log(`  ${cleanup}`);
console.log("");

const failed = cases.filter((c) => c.status === "fail").length;
console.log(`dev integration: ${failed === 0 ? "ok" : `failed (${failed} of ${cases.length})`}`);
process.exit(failed === 0 ? 0 : 1);

// The dashboard is a thin client over the control plane's REST API.
// Authentication is real (cookie-session against /auth/* on control);
// projects + keys + usage are still localStorage-backed scaffolding
// and will be wired up to /api/projects when those endpoints land.

const BASE: string = import.meta.env.VITE_HELA_CONTROL ?? "";

const K_PROJECTS = "hela.dash.projects";

export type Tier = "free" | "starter" | "growth" | "scale" | "ent";
export type Region = "iad" | "sjc" | "ams" | "sin" | "syd";

export interface Account {
  id: string;
  email: string;
  polar_customer_id: string | null;
  github_id: string | null;
}

export interface Project {
  id: string;
  name: string;
  region: Region;
  tier: Tier;
  created_at: string;
  jwt_registered: boolean;
  keys: { prefix: string; label: string | null; last_used_at: string | null }[];
  usage: { messages: number; connections: number; cap_messages: number; cap_connections: number };
  price_per_month: number;
}

export const TIER_PRICE: Record<Tier, number> = {
  free: 0,
  starter: 19,
  growth: 99,
  scale: 499,
  ent: 2500,
};

const TIER_CAPS: Record<Tier, { messages: number; connections: number }> = {
  free: { messages: 1_000_000, connections: 100 },
  starter: { messages: 10_000_000, connections: 1_000 },
  growth: { messages: 100_000_000, connections: 10_000 },
  scale: { messages: 1_000_000_000, connections: 100_000 },
  ent: { messages: Number.POSITIVE_INFINITY, connections: Number.POSITIVE_INFINITY },
};

// --- auth ---------------------------------------------------------------

let _account: Account | null = null;

// Hydrate the in-memory account from the server's session cookie. Call
// once on app boot before mounting the router; the route guards read
// `account()` synchronously and trust whatever bootstrap left here.
export async function bootstrap(): Promise<void> {
  try {
    const res = await fetch(`${BASE}/api/me`, { credentials: "include" });
    if (res.ok) {
      const json = (await res.json()) as { account: Account };
      _account = json.account;
    } else {
      _account = null;
    }
  } catch {
    _account = null;
  }
}

export function account(): Account | null {
  return _account;
}

export function isSignedIn(): boolean {
  return _account !== null;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function signup(email: string, password: string): Promise<Account> {
  return await postCreds("/auth/signup", email, password);
}

export async function login(email: string, password: string): Promise<Account> {
  return await postCreds("/auth/login", email, password);
}

async function postCreds(path: string, email: string, password: string): Promise<Account> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new AuthError(body.error ?? `request failed (${res.status})`, res.status);
  }
  const json = (await res.json()) as { account: Account };
  _account = json.account;
  return _account;
}

export async function signout(): Promise<void> {
  try {
    await fetch(`${BASE}/auth/logout`, { method: "POST", credentials: "include" });
  } finally {
    _account = null;
  }
}

// --- projects (still localStorage; backend wiring is a follow-up) -------

export function projects(): Project[] {
  const raw = localStorage.getItem(K_PROJECTS);
  const ps = raw ? (JSON.parse(raw) as Project[]) : [];
  return ps.map(fillUsage);
}

export function project(id: string): Project | null {
  return projects().find((p) => p.id === id) ?? null;
}

export function createProject(attrs: { name: string; region: Region; tier: Tier }): Project {
  const caps = TIER_CAPS[attrs.tier];
  const p: Project = {
    id: "proj_" + randomId(8),
    name: attrs.name,
    region: attrs.region,
    tier: attrs.tier,
    created_at: new Date().toISOString(),
    jwt_registered: false,
    keys: [
      {
        prefix: randomId(6),
        label: "default",
        last_used_at: null,
      },
    ],
    usage: {
      messages: 0,
      connections: 0,
      cap_messages: caps.messages,
      cap_connections: caps.connections,
    },
    price_per_month: TIER_PRICE[attrs.tier],
  };
  const all = projects();
  all.push(p);
  localStorage.setItem(K_PROJECTS, JSON.stringify(all));
  return p;
}

export function updateProject(id: string, patch: Partial<Project>): Project | null {
  const all = projects();
  const i = all.findIndex((p) => p.id === id);
  if (i === -1) return null;
  all[i] = { ...all[i], ...patch };
  localStorage.setItem(K_PROJECTS, JSON.stringify(all));
  return all[i];
}

export function deleteProject(id: string): void {
  const all = projects().filter((p) => p.id !== id);
  localStorage.setItem(K_PROJECTS, JSON.stringify(all));
}

export function rotateKey(id: string): { prefix: string; secret: string } {
  const p = project(id);
  if (!p) throw new Error("no project");
  const prefix = randomId(6);
  const secret = randomId(32);
  p.keys = p.keys.map((k) => ({ ...k, last_used_at: null }));
  p.keys.unshift({
    prefix,
    label: "rotated " + new Date().toISOString().slice(0, 10),
    last_used_at: null,
  });
  updateProject(id, { keys: p.keys });
  return { prefix, secret };
}

function fillUsage(p: Project): Project {
  // Deterministic fake usage between 10% and 80% of cap, for visual-dev.
  const seed = Array.from(p.id).reduce((a, c) => a + c.charCodeAt(0), 0);
  const pct = 0.1 + (seed % 70) / 100;
  if (p.usage.cap_messages === Number.POSITIVE_INFINITY) return p;
  return {
    ...p,
    usage: {
      ...p.usage,
      messages: Math.floor(p.usage.cap_messages * pct),
      connections: Math.floor(p.usage.cap_connections * (pct * 0.6)),
    },
  };
}

function randomId(n: number): string {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, n);
}

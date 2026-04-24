// The dashboard is a thin client over a REST API that lives behind login.
// In dev we mock the account state in localStorage so the flow can be
// exercised end-to-end without wiring Stripe. Swap these helpers for
// real fetches against a /api/* surface in production.

const K_ACCOUNT = "hela.dash.account";
const K_PROJECTS = "hela.dash.projects";

export type Tier = "free" | "starter" | "growth" | "scale" | "ent";
export type Region = "iad" | "sjc" | "ams" | "sin" | "syd";

export interface Account {
  email: string;
  stripe_customer_id: string | null;
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
  stripe_price_per_month: number;
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

export function isSignedIn(): boolean {
  return !!localStorage.getItem(K_ACCOUNT);
}

export function account(): Account | null {
  const raw = localStorage.getItem(K_ACCOUNT);
  return raw ? (JSON.parse(raw) as Account) : null;
}

export function signup(email: string): Account {
  const a: Account = {
    email,
    stripe_customer_id: "cus_" + Math.random().toString(36).slice(2, 10),
    github_id: null,
  };
  localStorage.setItem(K_ACCOUNT, JSON.stringify(a));
  if (!localStorage.getItem(K_PROJECTS)) {
    localStorage.setItem(K_PROJECTS, JSON.stringify([]));
  }
  return a;
}

export function signout(): void {
  localStorage.removeItem(K_ACCOUNT);
}

export function projects(): Project[] {
  const raw = localStorage.getItem(K_PROJECTS);
  const ps = raw ? (JSON.parse(raw) as Project[]) : [];
  // Rehydrate usage with something non-zero so the dashboard charts show
  // shape. Real implementation reads from the server's /v1/usage endpoint.
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
    stripe_price_per_month: TIER_PRICE[attrs.tier],
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

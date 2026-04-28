// Dashboard API client. Auth is real (cookie-session against /auth/*
// on the control plane). Projects + API keys are real (against /api/*).
// Usage stats are not implemented on the backend yet — the dashboard
// should not display fabricated numbers; until /api/usage lands the
// usage panels render placeholders.

const BASE: string =
  import.meta.env.VITE_HELA_CONTROL ??
  (import.meta.env.DEV ? "" : "https://control-production-059e.up.railway.app");

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
  multi_region: Region[];
  inserted_at: string;
  updated_at: string;
  jwt_registered: boolean;
}

export interface ApiKey {
  id: string;
  prefix: string;
  label: string | null;
  last_used_at: string | null;
  inserted_at: string;
}

export const TIER_PRICE: Record<Tier, number> = {
  free: 0,
  starter: 19,
  growth: 99,
  scale: 499,
  ent: 2500,
};

// --- auth ---------------------------------------------------------------

let _account: Account | null = null;

export async function bootstrap(): Promise<void> {
  try {
    const res = await fetch(`${BASE}/api/me`, { credentials: "include" });
    _account = res.ok ? ((await res.json()) as { account: Account }).account : null;
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

export class ApiError extends Error {
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
    throw new ApiError(body.error ?? `request failed (${res.status})`, res.status);
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

export async function deleteAccount(): Promise<void> {
  try {
    await jsonRequest("/api/me", { method: "DELETE" });
  } finally {
    _account = null;
  }
}

// --- billing ------------------------------------------------------------

export interface SubscriptionSummary {
  id: string | null;
  status: string | null;
  current_period_end: string | null;
  recurring_interval: string | null;
  amount: number | null;
  currency: string | null;
  product_id: string | null;
}

export interface BillingSummary {
  account: { id: string; email: string; polar_customer_id: string | null };
  projects: { id: string; name: string; tier: Tier; polar_subscription_id: string | null }[];
  subscriptions: SubscriptionSummary[];
  has_payment_method: boolean;
}

export async function getBilling(): Promise<BillingSummary> {
  return await jsonRequest<BillingSummary>("/api/billing");
}

// --- projects -----------------------------------------------------------

async function jsonRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...((init.headers as Record<string, string>) ?? {}),
    },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(body.error ?? `request failed (${res.status})`, res.status);
  }
  return (await res.json()) as T;
}

export async function listProjects(): Promise<Project[]> {
  const r = await jsonRequest<{ projects: Project[] }>("/api/projects");
  return r.projects;
}

export async function getProject(id: string): Promise<Project> {
  const r = await jsonRequest<{ project: Project }>(`/api/projects/${id}`);
  return r.project;
}

export async function createProject(attrs: {
  name: string;
  region: Region;
  tier: Tier;
}): Promise<Project> {
  const r = await jsonRequest<{ project: Project }>("/api/projects", {
    method: "POST",
    body: JSON.stringify(attrs),
  });
  return r.project;
}

export async function updateProject(
  id: string,
  attrs: Partial<Pick<Project, "name" | "tier">>,
): Promise<Project> {
  const r = await jsonRequest<{ project: Project }>(`/api/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(attrs),
  });
  return r.project;
}

export async function deleteProject(id: string): Promise<void> {
  await jsonRequest(`/api/projects/${id}`, { method: "DELETE" });
}

export async function setProjectJwk(id: string, jwk: object): Promise<Project> {
  const r = await jsonRequest<{ project: Project }>(`/api/projects/${id}/jwk`, {
    method: "PUT",
    body: JSON.stringify({ jwk }),
  });
  return r.project;
}

export async function startCheckout(projectId: string): Promise<string | null> {
  const r = await jsonRequest<{ url: string | null }>(`/api/projects/${projectId}/checkout`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return r.url;
}

// --- API keys -----------------------------------------------------------

export async function listKeys(projectId: string): Promise<ApiKey[]> {
  const r = await jsonRequest<{ keys: ApiKey[] }>(`/api/projects/${projectId}/keys`);
  return r.keys;
}

export async function createKey(
  projectId: string,
  label?: string,
): Promise<{ key: ApiKey; wire: string }> {
  // Backend returns {key, wire} where `wire` is the full
  // hk_<prefix>_<secret> string — only shown once at creation.
  return await jsonRequest<{ key: ApiKey; wire: string }>(`/api/projects/${projectId}/keys`, {
    method: "POST",
    body: JSON.stringify({ label: label ?? null }),
  });
}

export async function revokeKey(projectId: string, keyId: string): Promise<void> {
  await jsonRequest(`/api/projects/${projectId}/keys/${keyId}`, { method: "DELETE" });
}

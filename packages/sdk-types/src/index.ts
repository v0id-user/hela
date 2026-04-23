/**
 * Canonical wire types shared by @hela/sdk, the marketing site, and the
 * customer dashboard. The Elixir gateway is authoritative; every shape
 * here mirrors what `Hela.Chat.Message.to_wire/1` or the metrics sampler
 * produces.
 *
 * Keep this package dependency-free so it's safe to import from anywhere.
 */

export type Region = "iad" | "sjc" | "fra" | "sin" | "syd" | "dev";

export const REGIONS: Record<Region, { city: string; host: string }> = {
  iad: { city: "Ashburn, US East", host: "iad.hela.dev" },
  sjc: { city: "San Jose, US West", host: "sjc.hela.dev" },
  fra: { city: "Frankfurt, EU", host: "fra.hela.dev" },
  sin: { city: "Singapore, Asia", host: "sin.hela.dev" },
  syd: { city: "Sydney, AU", host: "syd.hela.dev" },
  dev: { city: "local dev", host: "localhost:4001" },
};

export type Tier = "free" | "starter" | "growth" | "scale" | "ent";

export const TIER_CAPS: Record<Tier, { messages: number; connections: number }> = {
  free:    { messages: 1_000_000,      connections: 100 },
  starter: { messages: 10_000_000,     connections: 1_000 },
  growth:  { messages: 100_000_000,    connections: 10_000 },
  scale:   { messages: 1_000_000_000,  connections: 100_000 },
  ent:     { messages: Number.POSITIVE_INFINITY, connections: Number.POSITIVE_INFINITY },
};

export const TIER_PRICE: Record<Tier, number> = {
  free: 0,
  starter: 19,
  growth: 99,
  scale: 499,
  ent: 2500,
};

export interface Message {
  id: string;
  channel: string;
  author: string;
  body: string;
  reply_to_id: string | null;
  node: string;
  inserted_at: string;
}

export interface HistoryReply {
  source: "cache" | "mixed" | "db";
  messages: Message[];
}

export interface JoinReply {
  messages: Message[];
  source: string;
  node: string;
  region: string;
}

export interface PresenceEntry {
  id: string;
  metas: Array<{
    online_at: number;
    node: string;
    region: string;
    phx_ref?: string;
  }>;
}

export interface LatencyHist {
  count: number;
  max_us: number;
  p50_us: number;
  p99_us: number;
  p999_us: number;
  buckets: { le_us: number; count: number }[];
}

export interface Snapshot {
  at_ms: number;
  node: string;
  region: string;
  cluster: string[];
  connections: number;
  rates: { ingest_received: number; batch_persisted: number; reductions: number };
  counters: {
    ingest_received_total: number;
    batch_persisted_total: number;
    channels_open: number;
  };
  pipeline: { queue_depth: number };
  cache: { total: number; by_project: Record<string, number> };
  quota: Record<string, { messages: number; connections: number }>;
  ingest_by_channel: Record<string, number>;
  latency: { broadcast: LatencyHist; persist: LatencyHist };
  system: {
    processes: number;
    processes_limit: number;
    atoms: number;
    atoms_limit: number;
    ports: number;
    ports_limit: number;
    ets_tables: number;
    memory_mb: number;
    memory_processes_mb: number;
    memory_binary_mb: number;
    memory_ets_mb: number;
    memory_code_mb: number;
    run_queue: number;
    schedulers: number;
    uptime_s: number;
  };
}

/**
 * What a customer-signed JWT must carry. The gateway enforces these
 * claims at every channel join.
 */
export interface HelaClaims {
  pid: string;
  sub: string;
  chans: Array<[scope: "read" | "write", pattern: string]>;
  exp?: number;
  iat?: number;
}

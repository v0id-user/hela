/**
 * Canonical wire types shared by @hela/sdk, the marketing site, and the
 * customer dashboard. The Elixir gateway is authoritative; every shape
 * here mirrors what `Hela.Chat.Message.to_wire/1` or the metrics sampler
 * produces.
 *
 * Wire types come from `./_generated.ts` — auto-emitted by
 * `make sdk.gen` from `packages/schemas/wire/`. Do not edit them.
 *
 * The hand-curated additions in this file cover three things the
 * schemas do not yet describe:
 *
 *   1. The hosted-region catalog (`Region`, `REGIONS`).
 *   2. The hosted-plans tier catalog (`Tier`, `TIER_CAPS`, `TIER_PRICE`).
 *   3. SDK-domain shapes that flatten or restructure the wire shapes
 *      for ergonomic use (`PresenceEntry`).
 *   4. `metrics:live` snapshot types and JWT claim shape — neither
 *      surface has a JSON Schema today.
 *
 * Keep this package dependency-free so it's safe to import from
 * anywhere.
 */

// Re-export every generated wire type. Consumers import `Message`,
// `JoinReply`, `Source`, etc. directly from "@hela/sdk-types".
export * from "./_generated.js";

// ---- region catalog (phase 5 of the codegen plan promotes this
// to a schema) -----------------------------------------------------

export type Region = "iad" | "sjc" | "ams" | "sin" | "syd" | "dev";

export const REGIONS: Record<Region, { city: string; host: string }> = {
  iad: { city: "Ashburn, US East", host: "gateway-production-bfdf.up.railway.app" },
  sjc: { city: "San Jose, US West", host: "gateway-production-bfdf.up.railway.app" },
  ams: { city: "Amsterdam, EU", host: "gateway-production-bfdf.up.railway.app" },
  sin: { city: "Singapore, Asia", host: "gateway-production-bfdf.up.railway.app" },
  syd: { city: "Sydney, AU", host: "gateway-production-bfdf.up.railway.app" },
  dev: { city: "local dev", host: "localhost:4001" },
};

// ---- tier catalog (phase 5 promotes this to a schema too) --------

export type Tier = "free" | "starter" | "growth" | "scale" | "ent";

export const TIER_CAPS: Record<Tier, { messages: number; connections: number }> = {
  free: { messages: 1_000_000, connections: 100 },
  starter: { messages: 10_000_000, connections: 1_000 },
  growth: { messages: 100_000_000, connections: 10_000 },
  scale: { messages: 1_000_000_000, connections: 100_000 },
  ent: { messages: Number.POSITIVE_INFINITY, connections: Number.POSITIVE_INFINITY },
};

export const TIER_PRICE: Record<Tier, number> = {
  free: 0,
  starter: 19,
  growth: 99,
  scale: 499,
  ent: 2500,
};

// ---- SDK-domain shapes -------------------------------------------

/**
 * SDK-flattened presence roster entry. The wire shape (`Entry` in
 * `_generated.ts`) is keyed by user id in a dict; this struct adds
 * the dict key as `id` for ergonomic list iteration.
 *
 * @hela/sdk's `presence.list()` returns `PresenceEntry[]`; the
 * underlying phoenix.js Presence shape is the wire `Entry` plus its
 * key.
 */
export interface PresenceEntry {
  id: string;
  metas: Array<{
    online_at: number;
    node: string;
    region: string;
    phx_ref?: string;
  }>;
}

// ---- ops shapes (metrics:live snapshot — not yet in schemas) -----

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

// ---- auth (JWT claims — not on the WS surface) -------------------

/**
 * What a customer-signed JWT must carry. The gateway enforces these
 * claims at every channel join.
 *
 * `ephemeral` — when true, the gateway treats this connection as
 * broadcast-only: live subscribers still receive messages, but join/history
 * do not replay cache or Postgres, and publishes are not persisted.
 */
export interface HelaClaims {
  pid: string;
  sub: string;
  chans: Array<[scope: "read" | "write", pattern: string]>;
  ephemeral?: boolean;
  exp?: number;
  iat?: number;
}

#!/usr/bin/env bun
// SPDX-License-Identifier: AGPL-3.0-or-later

type Frame = [string | null, string | null, string, string, unknown];

type Message = {
  id: string;
  channel: string;
  author: string;
  body: string;
  reply_to_id: string | null;
  node: string;
  inserted_at: string;
};

type PresenceState = Record<
  string,
  {
    metas: Array<{ online_at: number; node: string; region: string; phx_ref: string }>;
  }
>;

type Snapshot = {
  at_ms: number;
  node: string;
  region: string;
  cluster: string[];
  connections: number;
  rates: { ingest_received: number; batch_persisted: number; reductions: number };
  counters: { ingest_received_total: number; batch_persisted_total: number; channels_open: number };
  pipeline: { queue_depth: number };
  cache: { total: number; by_project: Record<string, number> };
  quota: Record<string, { messages: number; connections: number }>;
  ingest_by_channel: Record<string, number>;
  latency: {
    broadcast: {
      count: number;
      max_us: number;
      p50_us: number;
      p99_us: number;
      p999_us: number;
      buckets: Array<{ le_us: number; count: number }>;
    };
    persist: {
      count: number;
      max_us: number;
      p50_us: number;
      p99_us: number;
      p999_us: number;
      buckets: Array<{ le_us: number; count: number }>;
    };
  };
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
};

type SocketData = {
  channels: Map<string, { joinRef: string | null; nickname?: string }>;
};

const PORT = Number(process.env.HELA_E2E_MOCK_PORT ?? "4010");
const REGION = "ams";
const NODE_NAME = "hela-mock@127.0.0.1";
const STARTED_AT = Date.now();
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const messageStore = new Map<string, Message[]>();
const subscribers = new Map<string, Set<ServerWebSocket<SocketData>>>();
const presenceByTopic = new Map<string, Map<string, { phx_ref: string }>>();
let messageCounter = 0;
let tokenCounter = 0;

const server = Bun.serve<SocketData>({
  port: PORT,
  fetch(req, serverInstance) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/socket/websocket") {
      if (
        serverInstance.upgrade(req, {
          data: {
            channels: new Map(),
          },
        })
      ) {
        return;
      }

      return new Response("upgrade failed", { status: 400 });
    }

    if (url.pathname === "/playground/token" && req.method === "POST") {
      return jsonResponse(mintPlaygroundToken(), 200);
    }

    if (url.pathname === "/health" && req.method === "GET") {
      return new Response("ok", {
        status: 200,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          ...CORS_HEADERS,
        },
      });
    }

    if (url.pathname === "/version" && req.method === "GET") {
      return jsonResponse({
        ok: true,
        service: "mock",
        version: "0.0.0",
        commit: "mock-preview",
        region: REGION,
        node: NODE_NAME,
        generated_at: new Date().toISOString(),
      });
    }

    if (url.pathname.match(/^\/regions\/[^/]+\/ping$/) && req.method === "GET") {
      const slug = url.pathname.split("/")[2] ?? REGION;
      return jsonResponse({ ok: true, slug, region: REGION, node: NODE_NAME });
    }

    return new Response("not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      sendMetricsSnapshot(ws);
    },
    message(ws, raw) {
      const text = typeof raw === "string" ? raw : Buffer.from(raw).toString("utf8");
      const frame = JSON.parse(text) as Frame;
      handleFrame(ws, frame);
    },
    close(ws) {
      for (const [topic, channel] of ws.data.channels.entries()) {
        subscribers.get(topic)?.delete(ws);
        if (channel.nickname) {
          removePresence(topic, channel.nickname);
          broadcastPresence(topic);
        }
      }
    },
  },
});

console.log(`[mock gateway] listening on http://127.0.0.1:${PORT}`);

function handleFrame(ws: ServerWebSocket<SocketData>, frame: Frame): void {
  const [joinRef, ref, topic, event, payload] = frame;

  if (topic === "phoenix" && event === "heartbeat") {
    reply(ws, joinRef, ref, topic, {});
    return;
  }

  if (event === "phx_leave") {
    ws.data.channels.delete(topic);
    subscribers.get(topic)?.delete(ws);
    reply(ws, joinRef, ref, topic, {});
    return;
  }

  if (event === "phx_join") {
    ws.data.channels.set(topic, { joinRef });
    if (!subscribers.has(topic)) subscribers.set(topic, new Set());
    subscribers.get(topic)!.add(ws);
    reply(ws, joinRef, ref, topic, joinPayload(topic));
    if (topic === "metrics:live") sendMetricsSnapshot(ws);
    if (isPresenceTopic(topic)) broadcastPresence(topic);
    return;
  }

  if (event === "ping") {
    reply(ws, joinRef, ref, topic, {});
    return;
  }

  if (event === "publish") {
    const body = payload as { body?: string; author?: string; reply_to_id?: string | null };
    const message = appendMessage(topic, body.body ?? "", body.author ?? "anon", body.reply_to_id ?? null);
    reply(ws, joinRef, ref, topic, { id: message.id, quota: "ok" });
    broadcast(topic, [joinRef, null, topic, "message", message]);
    return;
  }

  if (event === "history") {
    const args = payload as { before?: string; limit?: number };
    reply(ws, joinRef, ref, topic, historyPayload(topic, args.before, args.limit));
    return;
  }

  if (event === "set_nick") {
    const args = payload as { nickname?: string };
    if (args.nickname) {
      const channel = ws.data.channels.get(topic);
      if (channel) channel.nickname = args.nickname;
      upsertPresence(topic, args.nickname);
      broadcastPresence(topic);
    }
    reply(ws, joinRef, ref, topic, {});
    return;
  }

  reply(ws, joinRef, ref, topic, {});
}

function joinPayload(topic: string) {
  if (topic === "metrics:live") {
    return {};
  }

  return {
    messages: [...(messageStore.get(topic) ?? [])],
    source: "cache",
    node: NODE_NAME,
    region: REGION,
  };
}

function historyPayload(topic: string, before?: string, limit = 20) {
  const all = [...(messageStore.get(topic) ?? [])];
  const filtered = before ? all.filter((message) => message.id < before) : all;
  return {
    source: "cache",
    messages: filtered.slice(-limit),
  };
}

function appendMessage(topic: string, body: string, author: string, replyToId: string | null): Message {
  const message: Message = {
    id: nextUuidLikeId(),
    channel: logicalChannelName(topic),
    author,
    body,
    reply_to_id: replyToId,
    node: NODE_NAME,
    inserted_at: new Date().toISOString(),
  };

  const messages = messageStore.get(topic) ?? [];
  messages.push(message);
  messageStore.set(topic, messages.slice(-200));
  return message;
}

function broadcastPresence(topic: string): void {
  const state = currentPresenceState(topic);
  broadcast(topic, [null, null, topic, "presence_state", state]);
}

function currentPresenceState(topic: string): PresenceState {
  const people = presenceByTopic.get(topic) ?? new Map();
  const state: PresenceState = {};

  for (const [nickname, meta] of people.entries()) {
    state[nickname] = {
      metas: [
        {
          online_at: 1,
          node: NODE_NAME,
          region: REGION,
          phx_ref: meta.phx_ref,
        },
      ],
    };
  }

  return state;
}

function upsertPresence(topic: string, nickname: string): void {
  if (!presenceByTopic.has(topic)) presenceByTopic.set(topic, new Map());
  presenceByTopic.get(topic)!.set(nickname, { phx_ref: `ref-${nickname}` });
}

function removePresence(topic: string, nickname: string): void {
  presenceByTopic.get(topic)?.delete(nickname);
}

function isPresenceTopic(topic: string): boolean {
  return topic.includes("presence");
}

function logicalChannelName(topic: string): string {
  return topic.replace(/^chan:[^:]+:/, "");
}

function reply(
  ws: ServerWebSocket<SocketData>,
  joinRef: string | null,
  ref: string | null,
  topic: string,
  response: unknown,
): void {
  ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response }]));
}

function broadcast(topic: string, frame: Frame): void {
  for (const subscriber of subscribers.get(topic) ?? []) {
    subscriber.send(JSON.stringify(frame));
  }
}

function sendMetricsSnapshot(ws: ServerWebSocket<SocketData>): void {
  const snapshot: Snapshot = {
    at_ms: Date.now(),
    node: NODE_NAME,
    region: REGION,
    cluster: [NODE_NAME],
    connections: Array.from(subscribers.values()).reduce((sum, set) => sum + set.size, 0),
    rates: { ingest_received: 8, batch_persisted: 8, reductions: 1200 },
    counters: {
      ingest_received_total: 42,
      batch_persisted_total: 42,
      channels_open: subscribers.size,
    },
    pipeline: { queue_depth: 0 },
    cache: { total: Array.from(messageStore.values()).reduce((sum, list) => sum + list.length, 0), by_project: { proj_public: 4 } },
    quota: { proj_public: { messages: 4, connections: 3 } },
    ingest_by_channel: {
      "demo:channels": 2,
      "demo:history": 1,
      "hello:world": 1,
    },
    latency: {
      broadcast: histogram(220),
      persist: histogram(610),
    },
    system: {
      processes: 123,
      processes_limit: 1_000_000,
      atoms: 32_000,
      atoms_limit: 1_000_000,
      ports: 12,
      ports_limit: 16_384,
      ets_tables: 18,
      memory_mb: 96,
      memory_processes_mb: 18,
      memory_binary_mb: 6,
      memory_ets_mb: 4,
      memory_code_mb: 8,
      run_queue: 0,
      schedulers: 8,
      uptime_s: Math.max(1, Math.floor((Date.now() - STARTED_AT) / 1000)),
    },
  };

  ws.send(JSON.stringify([null, null, "metrics:live", "snapshot", snapshot]));
}

function histogram(p50Us: number) {
  return {
    count: 8,
    max_us: p50Us * 4,
    p50_us: p50Us,
    p99_us: p50Us * 2,
    p999_us: p50Us * 3,
    buckets: [
      { le_us: p50Us / 2, count: 2 },
      { le_us: p50Us, count: 5 },
      { le_us: p50Us * 2, count: 7 },
      { le_us: p50Us * 4, count: 8 },
    ],
  };
}

function mintPlaygroundToken() {
  tokenCounter += 1;
  const exp = Math.floor((Date.now() + 5 * 60_000) / 1000);
  return {
    token: mockJwt({
      pid: "proj_public",
      sub: `guest-${tokenCounter}`,
      exp,
      iat: Math.floor(Date.now() / 1000),
      chans: [
        ["read", "hello:*"],
        ["write", "hello:*"],
        ["read", "demo:**"],
        ["write", "demo:**"],
      ],
    }),
    project_id: "proj_public",
    expires_in: 300,
  };
}

function mockJwt(claims: Record<string, unknown>): string {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify(claims));
  return `${header}.${payload}.mock`;
}

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function nextUuidLikeId(): string {
  messageCounter += 1;
  const msHex = Date.now().toString(16).padStart(12, "0");
  const counterHex = messageCounter.toString(16).padStart(20, "0");
  const raw = `${msHex}${counterHex}`.slice(0, 32);
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-7${raw.slice(13, 16)}-8${raw.slice(17, 20)}-${raw.slice(20, 32)}`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

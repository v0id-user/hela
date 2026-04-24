import { useEffect, useMemo, useRef, useState } from "react";
import { issuePlaygroundToken } from "@hela/sdk";
import { Panel, SectionHeading } from "./Panel";
import { ensureClient, uuidv7Timestamp } from "../lib/hela";
import { API_BASE } from "../lib/config";
import type { HelaChannel, Message, PresenceEntry } from "@hela/sdk";

/** The five primitive demos, stacked. */
export function Primitives() {
  return (
    <section style={{ padding: "40px 20px", maxWidth: 1100, margin: "0 auto" }}>
      <SectionHeading
        eyebrow="five primitives"
        title="the whole API, each with a live demo"
        sub="channels, presence, history, sequencing, auth. every widget below talks to a real hela cluster. no mocked data."
      />

      <div style={{ display: "grid", gap: 18 }}>
        <ChannelsDemo />
        <PresenceDemo />
        <HistoryDemo />
        <SequencingDemo />
        <AuthDemo />
      </div>
    </section>
  );
}

// 1. Channels ----------------------------------------------------------

function ChannelsDemo() {
  const [leftMsgs, setLeftMsgs] = useState<Message[]>([]);
  const [rightMsgs, setRightMsgs] = useState<Message[]>([]);
  const [rttLeft, setRttLeft] = useState<number | null>(null);
  const [rttRight, setRttRight] = useState<number | null>(null);
  const [leftDraft, setLeftDraft] = useState("");
  const [rightDraft, setRightDraft] = useState("");

  const leftChRef = useRef<HelaChannel | null>(null);
  const rightChRef = useRef<HelaChannel | null>(null);
  const t0sRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    let active = true;
    let off1: (() => void) | null = null;
    let off2: (() => void) | null = null;

    (async () => {
      const client = await ensureClient();

      const left = client.channel("demo:channels");
      const right = client.channel("demo:channels");
      leftChRef.current = left;
      rightChRef.current = right;

      await Promise.all([left.join(), right.join()]);
      if (!active) return;

      off1 = left.onMessage((m) => {
        setLeftMsgs((xs) => [...xs.slice(-19), m]);
        const start = t0sRef.current.get(m.id);
        if (start) setRttLeft(performance.now() - start);
      });

      off2 = right.onMessage((m) => {
        setRightMsgs((xs) => [...xs.slice(-19), m]);
        const start = t0sRef.current.get(m.id);
        if (start) setRttRight(performance.now() - start);
      });
    })();

    return () => {
      active = false;
      off1?.();
      off2?.();
      leftChRef.current?.leave();
      rightChRef.current?.leave();
    };
  }, []);

  async function send(from: "left" | "right", body: string) {
    if (!body.trim()) return;
    const ch = from === "left" ? leftChRef.current : rightChRef.current;
    if (!ch) return;

    const t = performance.now();
    const { id } = await ch.publish(body, { author: from === "left" ? "A" : "B" });
    t0sRef.current.set(id, t);

    // prune old entries
    if (t0sRef.current.size > 50) {
      const oldest = [...t0sRef.current.entries()].slice(0, -50);
      for (const [k] of oldest) t0sRef.current.delete(k);
    }

    if (from === "left") setLeftDraft("");
    else setRightDraft("");
  }

  return (
    <Panel title="1. channels" right="two clients · one topic">
      <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>
        type in one pane, watch it arrive in the other. both panes subscribe to the same topic on
        the same hela cluster. the number shows measured round-trip from the publishing browser back
        through Phoenix.PubSub to the receiving one.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <ChannelPane
          label="A"
          msgs={leftMsgs}
          draft={leftDraft}
          setDraft={setLeftDraft}
          send={() => send("left", leftDraft)}
          rtt={rttRight /* when A publishes, RTT measured on B */}
          rttLabel="A→B"
        />
        <ChannelPane
          label="B"
          msgs={rightMsgs}
          draft={rightDraft}
          setDraft={setRightDraft}
          send={() => send("right", rightDraft)}
          rtt={rttLeft}
          rttLabel="B→A"
        />
      </div>
    </Panel>
  );
}

function ChannelPane({
  label,
  msgs,
  draft,
  setDraft,
  send,
  rtt,
  rttLabel,
}: {
  label: string;
  msgs: Message[];
  draft: string;
  setDraft: (s: string) => void;
  send: () => void;
  rtt: number | null;
  rttLabel: string;
}) {
  return (
    <div style={{ border: "1px solid #222", background: "#0d0d0d" }}>
      <div
        style={{
          fontSize: 10,
          color: "#888",
          padding: "3px 8px",
          borderBottom: "1px dotted #222",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>pane {label}</span>
        <span style={{ color: rtt == null ? "#666" : "#c9a76a" }}>
          {rtt == null ? "rtt —" : `${rttLabel} ${rtt.toFixed(0)}ms`}
        </span>
      </div>
      <div style={{ padding: 8, minHeight: 140, maxHeight: 140, overflow: "auto" }}>
        {msgs.length === 0 ? (
          <div style={{ color: "#555", fontSize: 11 }}>... waiting</div>
        ) : (
          msgs.map((m) => (
            <div key={m.id} style={{ fontSize: 12, padding: "1px 0" }}>
              <span style={{ color: "#c9a76a" }}>@{m.author}</span>{" "}
              <span style={{ color: "#666", fontSize: 10 }}>{m.id.slice(0, 8)}</span> {m.body}
            </div>
          ))
        )}
      </div>
      <div style={{ display: "flex", borderTop: "1px dotted #222" }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          style={{
            flex: 1,
            border: "none",
            background: "transparent",
            color: "#e0e0e0",
          }}
        />
        <button onClick={send} disabled={!draft.trim()} style={{ margin: 3 }}>
          [ send ]
        </button>
      </div>
    </div>
  );
}

// 2. Presence ----------------------------------------------------------

function PresenceDemo() {
  const [entries, setEntries] = useState<PresenceEntry[]>([]);
  const [nickname, setNickname] = useState("");
  const chRef = useRef<HelaChannel | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("hela.nick");
    if (stored) setNickname(stored);
    else {
      const n = "visitor-" + Math.random().toString(36).slice(2, 6);
      localStorage.setItem("hela.nick", n);
      setNickname(n);
    }
  }, []);

  useEffect(() => {
    if (!nickname) return;
    let active = true;
    let offSync: (() => void) | null = null;

    (async () => {
      const client = await ensureClient();
      const ch = client.channel("demo:presence");
      chRef.current = ch;
      await ch.join();
      if (!active) return;

      await ch.setNickname(nickname).catch(() => {});

      offSync = ch.presence.onSync((list) => {
        setEntries(list);
      });
    })();

    return () => {
      active = false;
      offSync?.();
      chRef.current?.leave();
      chRef.current = null;
    };
  }, [nickname]);

  async function rename(n: string) {
    setNickname(n);
    localStorage.setItem("hela.nick", n);
    if (chRef.current) await chRef.current.setNickname(n).catch(() => {});
  }

  return (
    <Panel title="2. presence" right={`${entries.length} online`}>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>
        every visitor on this page is in the same `demo:presence` channel. Phoenix.Presence is
        CRDT-backed, so joins/leaves on any node in the region merge without a coordinator. try
        opening another tab.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>YOUR NICKNAME</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={nickname}
              onChange={(e) => rename(e.target.value.slice(0, 32))}
              style={{ flex: 1 }}
            />
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: "#666" }}>
            server broadcasts the change via the presence CRDT — other tabs update without a
            refresh.
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>
            ONLINE ({entries.length})
          </div>
          <div style={{ maxHeight: 140, overflow: "auto" }}>
            {entries.length === 0 && (
              <div style={{ color: "#555", fontSize: 11 }}>... nobody yet</div>
            )}
            {entries
              .sort((a, b) => a.id.localeCompare(b.id))
              .map((e) => (
                <div
                  key={e.id}
                  style={{
                    fontSize: 12,
                    padding: "2px 0",
                    borderBottom: "1px dotted #1a1a1a",
                    display: "flex",
                    justifyContent: "space-between",
                    color: e.id === nickname ? "#c9a76a" : "#c0c0c0",
                  }}
                >
                  <span>@{e.id}</span>
                  <span style={{ color: "#666", fontSize: 10 }}>
                    {e.metas[0]?.region} · {shortNode(e.metas[0]?.node ?? "")}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function shortNode(n: string): string {
  if (!n) return "";
  const parts = n.split(/[@:]/);
  return parts[parts.length - 1].slice(0, 8);
}

// 3. History -----------------------------------------------------------

function HistoryDemo() {
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [source, setSource] = useState<string>("—");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const chRef = useRef<HelaChannel | null>(null);

  useEffect(() => {
    let active = true;
    let off: (() => void) | null = null;

    (async () => {
      const client = await ensureClient();
      const ch = client.channel("demo:history");
      chRef.current = ch;

      const join = await ch.join();
      if (!active) return;

      setMsgs(join.messages);
      setSource("join");
      off = ch.onMessage((m) => {
        setMsgs((xs) => [...xs, m].slice(-200));
      });
    })();

    return () => {
      active = false;
      off?.();
      chRef.current?.leave();
    };
  }, []);

  async function loadOlder() {
    if (!chRef.current || loading || done) return;
    setLoading(true);
    const before = msgs[0]?.id;
    const r = await chRef.current.history({ before, limit: 20 });
    setSource(r.source);
    if (r.messages.length === 0) setDone(true);
    setMsgs((xs) => [...r.messages, ...xs]);
    setLoading(false);
  }

  async function seed() {
    if (!chRef.current) return;
    for (let i = 0; i < 5; i++) {
      await chRef.current.publish(`history msg ${Date.now()}_${i}`, {
        author: "seeder",
      });
    }
  }

  return (
    <Panel title="3. history" right={`source: ${source} · ${msgs.length} in view`}>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>
        each channel keeps its last N messages in a per-node ETS ring buffer. the `load older`
        button cursor-paginates backward with `id &lt; ?` on the UUIDv7 primary key. the panel badge
        tells you whether the page came from cache, a mix, or Postgres.
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <button onClick={loadOlder} disabled={loading || done}>
          [ {loading ? "loading..." : done ? "end of history" : "load older"} ]
        </button>
        <button onClick={seed}>[ seed 5 msgs ]</button>
      </div>
      <div
        style={{
          border: "1px solid #222",
          background: "#0d0d0d",
          maxHeight: 180,
          overflow: "auto",
          padding: 8,
        }}
      >
        {msgs.length === 0 ? (
          <div style={{ color: "#555", fontSize: 11 }}>
            ... no messages. click [ seed 5 msgs ] to populate.
          </div>
        ) : (
          msgs.map((m) => (
            <div key={m.id} style={{ fontSize: 12, padding: "1px 0" }}>
              <span style={{ color: "#666" }}>{m.id.slice(0, 8)}</span>{" "}
              <span style={{ color: "#c9a76a" }}>@{m.author}</span> {m.body}
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

// 4. Sequencing --------------------------------------------------------

function SequencingDemo() {
  const [msgs, setMsgs] = useState<Message[]>([]);
  const chRef = useRef<HelaChannel | null>(null);

  useEffect(() => {
    let active = true;
    let off: (() => void) | null = null;

    (async () => {
      const client = await ensureClient();
      const ch = client.channel("demo:seq");
      chRef.current = ch;
      const j = await ch.join();
      if (!active) return;
      setMsgs(j.messages);
      off = ch.onMessage((m) => setMsgs((xs) => [...xs.slice(-19), m]));
    })();

    return () => {
      active = false;
      off?.();
      chRef.current?.leave();
    };
  }, []);

  async function burst() {
    if (!chRef.current) return;
    // Fire 5 publishes in parallel to show ids stay monotone even under
    // concurrency.
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        chRef.current!.publish(`burst ${i}`, { author: "racer" }),
      ),
    );
  }

  const sorted = useMemo(() => msgs.slice().sort((a, b) => a.id.localeCompare(b.id)), [msgs]);
  const monotone =
    sorted.length === msgs.length && sorted.every((m, i) => msgs[i] && m.id === msgs[i].id);

  return (
    <Panel title="4. sequencing" right={monotone ? "ids monotonic ✓" : "out of order"}>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>
        every message gets a UUIDv7 at ingest. the first 48 bits are unix-ms, so ids sort by
        creation time. click `burst` to fire 5 publishes in parallel; watch them arrive with
        strictly increasing ids.
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <button onClick={burst}>[ burst 5 parallel ]</button>
      </div>
      <div
        style={{
          border: "1px solid #222",
          background: "#0d0d0d",
          maxHeight: 200,
          overflow: "auto",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ color: "#666", borderBottom: "1px solid #222" }}>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>uuidv7 prefix</th>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>decoded ts (ms from id)</th>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>body</th>
            </tr>
          </thead>
          <tbody>
            {msgs.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ color: "#555", padding: 10 }}>
                  ... empty. click [ burst 5 parallel ].
                </td>
              </tr>
            ) : (
              msgs.map((m) => (
                <tr key={m.id}>
                  <td style={{ padding: "2px 8px", color: "#c9a76a" }}>{m.id.slice(0, 13)}</td>
                  <td style={{ padding: "2px 8px", color: "#888" }}>
                    {uuidv7Timestamp(m.id).slice(11, 23)}
                  </td>
                  <td style={{ padding: "2px 8px" }}>{m.body}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// 5. Auth --------------------------------------------------------------

function AuthDemo() {
  const [token, setToken] = useState<string>("");
  const [claims, setClaims] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  async function fetchToken() {
    setLoading(true);
    const { token: t } = await issuePlaygroundToken({ endpoint: API_BASE });
    setToken(t);

    try {
      const [, b64] = t.split(".");
      const json = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
      setClaims(JSON.parse(json));
    } catch {
      setClaims(null);
    }

    setLoading(false);
  }

  return (
    <Panel title="5. auth" right="short-lived JWTs · RS256 or HS256">
      <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>
        hela verifies tokens signed by your backend against the public key you register in the
        dashboard. grants are scoped: a token's `chans` claim lists the read/write patterns it may
        act on. short TTL, no refresh round-trip — just re-sign. click below to ask hela for a
        5-minute guest token on the public playground project.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>YOUR BACKEND (node)</div>
          <pre style={{ fontSize: 11, margin: 0, lineHeight: 1.5 }}>{SNIPPET_NODE}</pre>
        </div>

        <div>
          <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>LIVE PLAYGROUND TOKEN</div>
          <button onClick={fetchToken} disabled={loading}>
            [ {loading ? "requesting..." : "request a guest token"} ]
          </button>

          {token && (
            <div style={{ marginTop: 8 }}>
              <div
                style={{
                  fontSize: 10,
                  color: "#666",
                  fontFamily: "inherit",
                  wordBreak: "break-all",
                  border: "1px dotted #222",
                  padding: 6,
                  maxHeight: 80,
                  overflow: "auto",
                }}
              >
                {token}
              </div>

              {claims && (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    color: "#c0c0c0",
                    border: "1px solid #222",
                    padding: 8,
                  }}
                >
                  <div style={{ color: "#888", fontSize: 10, marginBottom: 4 }}>
                    decoded claims:
                  </div>
                  <pre style={{ margin: 0, padding: 0, border: "none" }}>
                    {JSON.stringify(claims, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

const SNIPPET_NODE = `import { SignJWT, importPKCS8 } from "jose";

const key = await importPKCS8(process.env.HELA_KEY, "RS256");

export async function issueToken(userId, roomId) {
  return new SignJWT({
    pid:   "proj_abc123",
    sub:   userId,
    chans: [
      ["read",  "chat:*"],
      ["write", \`chat:room:\${roomId}\`],
    ],
  })
    .setProtectedHeader({ alg: "RS256" })
    .setExpirationTime("5m")
    .sign(key);
}`;

import { useEffect, useRef, useState } from "react";
import {
  ensureHeroClient,
  noteHeroError,
  noteHeroJoined,
  noteHeroRTT,
  uuidv7Timestamp,
} from "../lib/hela";
import type { HelaChannel, Message } from "@hela/sdk";
import { signupUrl } from "../lib/urls";

/**
 * The hero-strip inline channel. Anyone visiting the page drops into
 * the same `hello:world` channel with an ephemeral playground token —
 * live messages only, no join replay from cache or Postgres.
 */
export function Hero() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [region, setRegion] = useState<string>("");
  const [connected, setConnected] = useState(false);
  const [rtt, setRtt] = useState<number | null>(null);
  const chRef = useRef<HelaChannel | null>(null);

  useEffect(() => {
    let active = true;
    let offMsg: (() => void) | null = null;
    let offOpen: (() => void) | null = null;
    let offClose: (() => void) | null = null;
    let offError: (() => void) | null = null;

    (async () => {
      const client = await ensureHeroClient();
      offOpen = client.onOpen(() => {
        if (active) setConnected(true);
      });
      offClose = client.onClose(() => {
        if (active) setConnected(false);
      });
      offError = client.onError(() => {
        if (active) setConnected(false);
      });
      const ch = client.channel("hello:world");
      chRef.current = ch;
      const { messages: hist, region: r } = await ch.join();
      if (!active) return;
      noteHeroJoined(r);
      setRegion(r);
      setConnected(true);
      // hello:world is ephemeral, so the server never replays history.
      // Seed a small visual chorus on first paint so the panel reads
      // like a populated room instead of dead air. Real publishes from
      // this tab and from other open visitors append after this list.
      setMessages(hist.length > 0 ? hist : seedMessages());

      offMsg = ch.onMessage((m) => {
        setMessages((xs) => [...xs.slice(-49), m]);
      });

      // One ping to surface regional RTT under the input.
      const rt = await client.measureRTT(ch);
      if (active) {
        noteHeroRTT(rt);
        setRtt(rt);
      }
    })().catch((e) => {
      noteHeroError(e);
      console.error("[hero]", e);
    });

    return () => {
      active = false;
      offMsg?.();
      offOpen?.();
      offClose?.();
      offError?.();
      chRef.current?.leave();
      chRef.current = null;
    };
  }, []);

  async function send() {
    const body = draft.trim();
    if (!body || !chRef.current) return;
    setDraft("");
    await chRef.current.publish(body);
  }

  return (
    <section style={{ padding: "40px 20px 24px", maxWidth: 1100, margin: "0 auto" }}>
      <div
        style={{
          fontSize: 10,
          color: "#c9a76a",
          textTransform: "uppercase",
          letterSpacing: 1.5,
          marginBottom: 12,
        }}
      >
        open source real time on BEAM
      </div>
      <h1 style={{ fontSize: 34, lineHeight: 1.2, color: "#e0e0e0", marginBottom: 14 }}>
        pick a region. get sub-100ms channels, presence, and history.
        <br />
        on our hosted product: flat monthly pricing, no per-message billing.
      </h1>
      <p style={{ color: "#888", maxWidth: 720, marginBottom: 20 }}>
        hela is the open source stack on Elixir/Phoenix, the same monorepo you can self host. the
        regions you pick here are the hosted service: clusters in five cities, JWT authed
        WebSockets. the demo below runs on an ephemeral token — live traffic only, no replay.
      </p>

      <div style={{ display: "flex", gap: 10, marginBottom: 28, flexWrap: "wrap" }}>
        <a href={signupUrl()}>
          <button className="cta">[ start free ]</button>
        </a>
        <a href="/dashboard">
          <button>[ live dashboard ]</button>
        </a>
        <a href="/how">
          <button>[ how it works ]</button>
        </a>
      </div>

      <div data-testid="hero-channel" style={{ background: "#0a0a0a", border: "1px solid #333" }}>
        <div
          style={{
            fontSize: 10,
            color: "#888",
            padding: "4px 10px",
            borderBottom: "1px solid #333",
            background: "#141414",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>
            hello:world — inline channel · <span style={{ color: "#c9a76a" }}>ephemeral</span> ·
            everyone's in it
          </span>
          <span style={{ color: "#666" }}>
            {connected
              ? `> connected · region: ${region || "?"}${rtt != null ? ` · rtt ${rtt.toFixed(0)}ms` : ""}`
              : "... connecting"}
          </span>
        </div>
        <div style={{ padding: 10, minHeight: 160, maxHeight: 220, overflow: "auto" }}>
          {messages.length === 0 ? (
            <div style={{ color: "#555" }}>... waiting. type something below.</div>
          ) : (
            messages.map((m) => (
              <div key={m.id} style={{ fontSize: 12, color: "#c0c0c0", padding: "2px 0" }}>
                <span style={{ color: "#c9a76a" }}>@{m.author}</span>
                <span style={{ color: "#888" }}>
                  {" "}
                  {m.id.slice(0, 8)} · {uuidv7Timestamp(m.id).slice(11, 23)}
                </span>{" "}
                {m.body}
              </div>
            ))
          )}
        </div>
        <div
          style={{
            display: "flex",
            borderTop: "1px solid #333",
            alignItems: "stretch",
          }}
        >
          <span
            style={{
              color: "#666",
              padding: "6px 10px",
              borderRight: "1px dotted #222",
              fontSize: 12,
            }}
          >
            &gt;
          </span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={connected ? "say hi" : "connecting..."}
            disabled={!connected}
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              padding: "6px 10px",
              color: "#e0e0e0",
              fontSize: 13,
            }}
          />
          <button onClick={send} disabled={!connected || !draft.trim()} style={{ margin: 3 }}>
            [ send ]
          </button>
        </div>
        <div
          style={{
            fontSize: 10,
            color: "#666",
            padding: "4px 10px",
            borderTop: "1px solid #222",
            background: "#0d0d0d",
            lineHeight: 1.5,
          }}
        >
          ephemeral channel: the gateway broadcasts to everyone connected right now and forgets.
          nothing is cached, nothing hits Postgres, nothing replays on reload — the visible history
          below this banner is seed text for the demo, not stored messages.
        </div>
      </div>
    </section>
  );
}

// Seed messages rendered on first paint of the hero panel. They look
// like prior conversation so the demo panel doesn't open into empty
// air. Real publishes append below.
//
// The id format mimics a UUIDv7 — first 12 hex chars decode to a ms
// timestamp via `uuidv7Timestamp` so the timestamps under each
// message read as the past few minutes, not "1970".
function seedMessages(): Message[] {
  const lines: { author: string; body: string; secondsAgo: number }[] = [
    { author: "alice", body: "first packet 🚀", secondsAgo: 612 },
    { author: "bob", body: "is this thing on?", secondsAgo: 568 },
    { author: "carol", body: "hey y'all", secondsAgo: 540 },
    { author: "dan", body: "from sjc, rtt 88ms", secondsAgo: 421 },
    { author: "eve", body: "presence works on `chat:*`. try /how", secondsAgo: 305 },
    { author: "alice", body: "joining from a phone tab too", secondsAgo: 240 },
    {
      author: "frank",
      body: "channels namespaced per project, JWT carries the claim",
      secondsAgo: 184,
    },
    { author: "grace", body: "ephemeral mode = no cache, no postgres, no replay", secondsAgo: 121 },
    { author: "carol", body: "neat — connection is sticky to ams region", secondsAgo: 64 },
    { author: "henry", body: "type below to send into this room", secondsAgo: 18 },
  ];
  const node = "hela-ams@gateway-dev.railway.internal";
  return lines.map(({ author, body, secondsAgo }) => {
    const at = Date.now() - secondsAgo * 1000;
    const id = fakeUuidv7At(at);
    return {
      id,
      channel: "hello:world",
      author,
      body,
      reply_to_id: null,
      node,
      inserted_at: new Date(at).toISOString(),
    };
  });
}

function fakeUuidv7At(ms: number): string {
  const tsHex = ms.toString(16).padStart(12, "0");
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(10)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // 8-4-4-4-12 layout. Version nibble at byte 6 = 7. Variant high bits
  // at byte 8 = 10xx (so first nibble is 8, 9, a, or b).
  const variantNibble = (0x8 + (parseInt(rand[3], 16) & 0x3)).toString(16);
  return [
    tsHex.slice(0, 8),
    tsHex.slice(8, 12),
    "7" + rand.slice(0, 3),
    variantNibble + rand.slice(4, 7),
    rand.slice(7, 19).padEnd(12, "0"),
  ].join("-");
}

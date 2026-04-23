import { useState } from "react";
import { Panel, SectionHeading } from "./Panel";

const TABS = {
  browser: `import { connect } from "@hela/sdk";

// Fetch a short-lived JWT from your backend.
const token = await fetch("/api/hela-token").then(r => r.text());

const client = connect({ region: "iad", token });
const chat = client.channel("chat:room42");

const { messages } = await chat.join();
chat.onMessage(m => {
  console.log(m.author, m.body);
});

await chat.publish("hello");`,
  server: `// POST /api/hela-token in your Node backend.
import { SignJWT, importPKCS8 } from "jose";

const key = await importPKCS8(process.env.HELA_KEY, "RS256");

export default async function handler(req, res) {
  const user = await getSession(req);

  const token = await new SignJWT({
    pid:   "proj_abc123",
    sub:   user.id,
    chans: [
      ["read",  "chat:*"],
      ["write", \`chat:room:\${user.roomId}\`],
    ],
  })
    .setProtectedHeader({ alg: "RS256" })
    .setExpirationTime("5m")
    .sign(key);

  res.send(token);
}`,
};

export function Quickstart() {
  const [tab, setTab] = useState<keyof typeof TABS>("browser");
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(TABS[tab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <section style={{ padding: "40px 20px", maxWidth: 1100, margin: "0 auto" }}>
      <SectionHeading
        eyebrow="quickstart"
        title="ten lines in, live channel out"
        sub="the browser SDK wraps phoenix.js with a typed surface. the server half is whatever issues you a JWT — standard jose works."
      />

      <Panel
        title={`@hela/sdk · ${tab}`}
        right={
          <div style={{ display: "flex", gap: 8 }}>
            {(["browser", "server"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? "#1a1a1a" : "transparent",
                  color: tab === t ? "#fff" : "#888",
                  border: "1px solid #333",
                  padding: "2px 8px",
                  fontSize: 11,
                }}
              >
                {t}
              </button>
            ))}
            <button onClick={copy} style={{ fontSize: 11, padding: "2px 8px" }}>
              [ {copied ? "copied" : "copy"} ]
            </button>
          </div>
        }
      >
        <pre style={{ margin: 0, fontSize: 12, lineHeight: 1.5, maxHeight: 340 }}>
          {TABS[tab]}
        </pre>
      </Panel>
    </section>
  );
}

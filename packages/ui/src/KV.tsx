import { ReactNode } from "react";

export function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "3px 0",
        borderBottom: "1px dotted #1a1a1a",
        fontSize: 12,
      }}
    >
      <span style={{ color: "#666" }}>{k}</span>
      <span style={{ color: "#c0c0c0" }}>{v}</span>
    </div>
  );
}

export function Bar({ value, max }: { value: number; max: number }) {
  const pct = max === Number.POSITIVE_INFINITY ? 0 : Math.min(100, (value / max) * 100);
  const tone = pct > 85 ? "#c9a76a" : pct > 70 ? "#8a7555" : "#5a5a5a";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 8, background: "#161616", border: "1px solid #222" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: tone }} />
      </div>
      <span style={{ fontSize: 10, color: "#888", width: 40, textAlign: "right" }}>
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

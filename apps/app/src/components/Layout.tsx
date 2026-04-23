import { ReactNode } from "react";

export function Page({ children }: { children: ReactNode }) {
  return <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>{children}</div>;
}

export function Panel({
  title,
  right,
  children,
  style,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ background: "#0a0a0a", border: "1px solid #333", ...style }}>
      <div
        style={{
          fontSize: 10,
          color: "#888",
          textTransform: "uppercase",
          padding: "4px 10px",
          borderBottom: "1px solid #333",
          background: "#141414",
          letterSpacing: 0.5,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>{title}</span>
        {right && <span style={{ color: "#666" }}>{right}</span>}
      </div>
      <div style={{ padding: 12 }}>{children}</div>
    </div>
  );
}

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
      <div
        style={{
          flex: 1,
          height: 8,
          background: "#161616",
          border: "1px solid #222",
        }}
      >
        <div style={{ width: `${pct}%`, height: "100%", background: tone }} />
      </div>
      <span style={{ fontSize: 10, color: "#888", width: 40, textAlign: "right" }}>
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

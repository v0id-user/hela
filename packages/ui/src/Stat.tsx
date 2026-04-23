import { ReactNode } from "react";

export function Stat({
  label,
  value,
  sub,
  tip,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tip?: string;
}) {
  return (
    <div style={{ background: "#0a0a0a", padding: "6px 10px", minHeight: 56 }} title={tip}>
      <div style={{ fontSize: 9, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 16, color: "#e0e0e0", marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: "#555", marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 1,
        background: "#333",
        border: "1px solid #333",
      }}
    >
      {children}
    </div>
  );
}

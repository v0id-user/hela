import { ReactNode } from "react";

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
          alignItems: "center",
        }}
      >
        <span>{title}</span>
        {right && <span style={{ color: "#666" }}>{right}</span>}
      </div>
      <div style={{ padding: 12 }}>{children}</div>
    </div>
  );
}

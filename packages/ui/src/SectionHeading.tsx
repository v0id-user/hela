export function SectionHeading({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 10,
          color: "#c9a76a",
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: 4,
        }}
      >
        {eyebrow}
      </div>
      <h2>{title}</h2>
      {sub && <div style={{ marginTop: 6, color: "#888", fontSize: 13, maxWidth: 720 }}>{sub}</div>}
    </div>
  );
}

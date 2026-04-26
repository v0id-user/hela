import { Link, useRouterState } from "@tanstack/react-router";
import { groupedPages } from "../lib/docs";
import { Search } from "./Search";

export function Sidebar() {
  const groups = groupedPages();
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside
      style={{
        width: 260,
        flex: "0 0 260px",
        borderRight: "1px solid var(--rule)",
        background: "var(--bg-elev)",
        position: "sticky",
        top: 56,
        alignSelf: "flex-start",
        maxHeight: "calc(100vh - 56px)",
        overflowY: "auto",
        padding: "16px 0",
      }}
    >
      <div style={{ padding: "0 18px 12px" }}>
        <Search />
      </div>
      {groups.map((g) => (
        <div key={g.key} style={{ padding: "10px 0" }}>
          <div
            style={{
              padding: "0 18px 6px",
              fontSize: 10,
              letterSpacing: 1.5,
              color: "var(--gold)",
              textTransform: "uppercase",
            }}
          >
            {g.label}
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {g.pages.map((p) => {
              const to = `/${p.slug}`;
              const active = path === to || (to === "/index" && path === "/");
              return (
                <li key={p.slug}>
                  <Link
                    to={to}
                    style={{
                      display: "block",
                      padding: "4px 18px",
                      color: active ? "var(--fg-bright)" : "var(--fg)",
                      background: active ? "#1a1a1a" : "transparent",
                      borderLeft: active ? "2px solid var(--gold)" : "2px solid transparent",
                      fontSize: 13,
                    }}
                  >
                    {p.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div
        style={{
          padding: "20px 18px 8px",
          marginTop: 8,
          borderTop: "1px solid var(--rule-soft)",
          fontSize: 11,
          color: "var(--fg-dim)",
        }}
      >
        <div>
          source on{" "}
          <a
            href="https://github.com/v0id-user/hela"
            target="_blank"
            rel="noreferrer noopener"
            style={{ color: "var(--link)" }}
          >
            github
          </a>
        </div>
        <div style={{ marginTop: 4 }}>AGPL-3.0-or-later</div>
      </div>
    </aside>
  );
}

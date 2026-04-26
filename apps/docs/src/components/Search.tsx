import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { search, type SearchHit } from "../lib/docs";

/**
 * Inline search box. Hits update as the user types; arrow keys move
 * the highlight; Enter navigates to the first hit. The hit list lives
 * inline (no popover) so the search reads like an extension of the
 * sidebar — fewer DOM contortions and easier focus management.
 */
export function Search() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setHits(search(q));
    setActive(0);
  }, [q]);

  // Slash to focus, Esc to clear.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === inputRef.current) {
        setQ("");
        inputRef.current?.blur();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const showHits = useMemo(() => q.trim().length >= 2 && hits.length > 0, [q, hits]);

  return (
    <div>
      <div style={{ position: "relative" }}>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (!showHits) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, hits.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const hit = hits[active];
              if (hit) {
                navigate({ to: `/${hit.page.slug}` });
                setQ("");
              }
            }
          }}
          placeholder="search docs (press /)"
          style={{
            width: "100%",
            background: "var(--bg)",
            border: "1px solid var(--rule)",
            borderRadius: 3,
            padding: "6px 10px",
            color: "var(--fg)",
            fontFamily: "inherit",
            fontSize: 12.5,
            outline: "none",
          }}
        />
      </div>
      {showHits ? (
        <ul
          style={{
            listStyle: "none",
            margin: "6px 0 0",
            padding: 0,
            border: "1px solid var(--rule-soft)",
            borderRadius: 3,
            background: "var(--bg)",
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {hits.map((hit, i) => (
            <li key={hit.page.slug}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => {
                  navigate({ to: `/${hit.page.slug}` });
                  setQ("");
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 10px",
                  border: 0,
                  background: i === active ? "#1a1a1a" : "transparent",
                  color: "var(--fg)",
                  fontFamily: "inherit",
                  fontSize: 12,
                  cursor: "pointer",
                  borderBottom: "1px solid var(--rule-soft)",
                }}
              >
                <div style={{ color: "var(--fg-bright)" }}>{hit.page.title}</div>
                {hit.excerpt ? (
                  <div
                    style={{
                      color: "var(--fg-dim)",
                      fontSize: 11,
                      marginTop: 2,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {hit.excerpt}
                  </div>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

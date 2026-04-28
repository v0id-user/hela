import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  notFound,
  useParams,
} from "@tanstack/react-router";
import { useEffect, useState, type CSSProperties } from "react";
import { Sidebar } from "./components/Sidebar";
import { Markdown } from "./components/Markdown";
import { allPages, pageBySlug } from "./lib/docs";

const APP_BASE = "https://app-production-1716a.up.railway.app";
const WEB_BASE = "https://web-production-f24fc.up.railway.app";

// Mirror apps/web/src/router.tsx exactly so the navbar reads as a
// single bar across all three surfaces (marketing, docs, dashboard).
// Anything that diverges here will jump when a user clicks between
// them — keep it in sync.
const NAV_HEIGHT = 35;

const linkStyle: CSSProperties = {
  color: "#888",
  textDecoration: "none",
  fontSize: 12,
  padding: "6px 14px",
  borderRight: "1px solid #333",
};

const activeLinkStyle: CSSProperties = {
  color: "#fff",
  background: "#1a1a1a",
};

const ctaLinkStyle: CSSProperties = {
  color: "#c9a76a",
  textDecoration: "none",
  fontSize: 12,
  padding: "6px 14px",
  borderLeft: "1px solid #333",
  borderRight: "1px solid #333",
  background: "#14110a",
};

const rootRoute = createRootRoute({
  component: () => (
    <div style={{ minHeight: "100vh", background: "#111", color: "#c0c0c0" }}>
      <nav
        style={{
          display: "flex",
          gap: 0,
          padding: 0,
          borderBottom: "1px solid #333",
          alignItems: "center",
          background: "#0a0a0a",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <a
          href={WEB_BASE}
          style={{
            padding: "4px 14px",
            borderRight: "1px solid #333",
            display: "flex",
            alignItems: "center",
            height: 28,
          }}
          aria-label="hela home"
        >
          <img src="/brand/wordmark.svg" alt="hela" height={22} style={{ display: "block" }} />
        </a>
        <a href={WEB_BASE} style={linkStyle}>
          home
        </a>
        <a href={`${WEB_BASE}/how`} style={linkStyle}>
          how
        </a>
        {/* `docs` is the active page on this surface, so apply
            activeLinkStyle directly — TanStack `activeProps` only
            covers in-app routes, but the nav bar reads better when
            this is the visibly-active link. */}
        <Link to="/" style={{ ...linkStyle, ...activeLinkStyle }}>
          docs
        </Link>
        <a href={`${APP_BASE}/dashboard`} style={linkStyle}>
          dashboard
        </a>
        <a href={`${WEB_BASE}/status`} style={linkStyle}>
          status
        </a>
        <a href={APP_BASE} style={{ ...linkStyle, marginLeft: 0 }}>
          sign in
        </a>
        <a href={`${APP_BASE}/signup`} style={ctaLinkStyle}>
          get started &rarr;
        </a>
        <span
          style={{
            marginLeft: "auto",
            padding: "6px 14px",
            color: "#666",
            fontSize: 11,
            borderLeft: "1px solid #333",
          }}
        >
          elixir · phoenix · pubsub · ets · presence · <VersionStamp />
        </span>
      </nav>
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          minHeight: `calc(100vh - ${NAV_HEIGHT}px)`,
        }}
      >
        <Sidebar navHeight={NAV_HEIGHT} />
        <main style={{ flex: 1, minWidth: 0 }}>
          <Outlet />
        </main>
      </div>
    </div>
  ),
});

function VersionStamp() {
  const [commit, setCommit] = useState<string>("dev");

  useEffect(() => {
    fetch("/version", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((v: { commit?: string } | null) => {
        if (v?.commit) setCommit(v.commit.slice(0, 7));
      })
      .catch(() => {});
  }, []);

  return <span>{commit}</span>;
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: function Index() {
    const page = pageBySlug("index") ?? allPages()[0];
    if (!page) return <div className="prose">no docs found</div>;
    return (
      <article className="prose">
        <Markdown content={page.content} slug={page.slug} />
      </article>
    );
  },
});

const docRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$",
  beforeLoad: ({ params }) => {
    const slug = (params as { _splat: string })._splat;
    if (!pageBySlug(slug)) throw notFound();
  },
  component: function Doc() {
    const params = useParams({ strict: false }) as { _splat?: string };
    const slug = params._splat ?? "";
    const page = pageBySlug(slug);
    if (!page) {
      return (
        <article className="prose">
          <h1>not found</h1>
          <p>
            no doc at <code>/{slug}</code>. try the sidebar.
          </p>
        </article>
      );
    }
    return (
      <article className="prose">
        <Markdown content={page.content} slug={page.slug} />
        <hr />
        <p style={{ fontSize: 12, color: "var(--fg-dim)" }}>
          source:{" "}
          <a
            href={`https://github.com/v0id-user/hela/blob/main/${page.path}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            {page.path}
          </a>
        </p>
      </article>
    );
  },
  notFoundComponent: () => (
    <article className="prose">
      <h1>not found</h1>
      <p>that doc does not exist. try the sidebar.</p>
    </article>
  ),
});

const routeTree = rootRoute.addChildren([indexRoute, docRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

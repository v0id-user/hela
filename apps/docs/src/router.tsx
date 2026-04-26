import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  notFound,
  useParams,
} from "@tanstack/react-router";
import { Sidebar } from "./components/Sidebar";
import { Markdown } from "./components/Markdown";
import { allPages, pageBySlug } from "./lib/docs";

const APP_BASE = "https://app-production-1716a.up.railway.app";
const WEB_BASE = "https://web-production-f24fc.up.railway.app";

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
          height: 56,
        }}
      >
        <a
          href={WEB_BASE}
          style={{
            padding: "4px 14px",
            borderRight: "1px solid #333",
            display: "flex",
            alignItems: "center",
            height: "100%",
          }}
          aria-label="hela home"
        >
          <img src="/brand/wordmark.svg" alt="hela" height={22} style={{ display: "block" }} />
        </a>
        <Link
          to="/"
          style={navLink}
          activeOptions={{ exact: true }}
          activeProps={{ style: navLinkActive }}
        >
          docs
        </Link>
        <a href={`${WEB_BASE}/how`} style={navLink}>
          how it works
        </a>
        <a href={`${WEB_BASE}/status`} style={navLink}>
          status
        </a>
        <div style={{ flex: 1 }} />
        <a
          href="https://github.com/v0id-user/hela"
          target="_blank"
          rel="noreferrer noopener"
          style={navLink}
        >
          github
        </a>
        <a href={`${APP_BASE}`} style={navLink}>
          sign in
        </a>
        <a href={`${APP_BASE}/signup`} style={{ ...navLink, color: "var(--gold)" }}>
          get started
        </a>
      </nav>
      <div style={{ display: "flex", alignItems: "stretch", minHeight: "calc(100vh - 56px)" }}>
        <Sidebar />
        <main style={{ flex: 1, minWidth: 0 }}>
          <Outlet />
        </main>
      </div>
    </div>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: function Index() {
    // Show docs/index.md as the landing page; fall back to the
    // first page if the index doc is missing.
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
  // splat path: anything after `/`
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

const navLink = {
  padding: "0 14px",
  height: "100%",
  display: "flex",
  alignItems: "center",
  borderRight: "1px solid #333",
  color: "#c0c0c0",
  fontSize: 13,
  textDecoration: "none",
} as const;

const navLinkActive = {
  background: "#1a1a1a",
  color: "#e8e8e8",
} as const;

import { createRootRoute, createRoute, createRouter, Link, Outlet } from "@tanstack/react-router";
import { Home } from "./routes/Home";
import { How } from "./routes/How";
import { Dashboard } from "./routes/Dashboard";
import { Signup } from "./routes/Signup";
import { Status } from "./routes/Status";
import { DOCS_BASE, SIGNIN_URL, signupUrl } from "./lib/urls";

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
        <Link
          to="/"
          style={{
            padding: "4px 14px",
            borderRight: "1px solid #333",
            display: "flex",
            alignItems: "center",
            height: 28,
          }}
          aria-label="hela home"
        >
          {/* SVG wordmark — swappable anywhere the nav appears.
              Height matches the nav link height so rows align. */}
          <img src="/brand/wordmark.svg" alt="hela" height={22} style={{ display: "block" }} />
        </Link>
        <Link to="/" style={linkStyle} activeProps={{ style: activeLinkStyle }}>
          home
        </Link>
        <Link to="/how" style={linkStyle} activeProps={{ style: activeLinkStyle }}>
          how
        </Link>
        <a href={DOCS_BASE} style={linkStyle}>
          docs
        </a>
        <Link to="/dashboard" style={linkStyle} activeProps={{ style: activeLinkStyle }}>
          dashboard
        </Link>
        <Link to="/status" style={linkStyle} activeProps={{ style: activeLinkStyle }}>
          status
        </Link>
        <a href={SIGNIN_URL} style={{ ...linkStyle, marginLeft: 0 }}>
          sign in
        </a>
        <a href={signupUrl()} style={ctaLinkStyle}>
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
          elixir · phoenix · pubsub · ets · presence
        </span>
      </nav>
      <Outlet />
    </div>
  ),
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Home,
});

const howRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/how",
  component: How,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  component: Dashboard,
});

const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signup",
  component: Signup,
});

const statusRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/status",
  component: Status,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  howRoute,
  dashboardRoute,
  signupRoute,
  statusRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const linkStyle: React.CSSProperties = {
  color: "#888",
  textDecoration: "none",
  fontSize: 12,
  padding: "6px 14px",
  borderRight: "1px solid #333",
};

const activeLinkStyle: React.CSSProperties = {
  color: "#fff",
  background: "#1a1a1a",
};

// Primary CTA slot in the nav — colored to match the wordmark accent
// (#c9a76a). Same padding/height as the nav links so it aligns.
const ctaLinkStyle: React.CSSProperties = {
  color: "#c9a76a",
  textDecoration: "none",
  fontSize: 12,
  padding: "6px 14px",
  borderLeft: "1px solid #333",
  borderRight: "1px solid #333",
  background: "#14110a",
};

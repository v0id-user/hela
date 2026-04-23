import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
} from "@tanstack/react-router";
import { Home } from "./routes/Home";
import { How } from "./routes/How";
import { Dashboard } from "./routes/Dashboard";
import { SIGNIN_URL } from "./lib/urls";

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
            padding: "6px 14px",
            borderRight: "1px solid #333",
            color: "#c9a76a",
            letterSpacing: 1,
            fontSize: 12,
          }}
        >
          [ hela ]
        </Link>
        <Link to="/" style={linkStyle} activeProps={{ style: activeLinkStyle }}>
          home
        </Link>
        <Link to="/how" style={linkStyle} activeProps={{ style: activeLinkStyle }}>
          how
        </Link>
        <Link to="/dashboard" style={linkStyle} activeProps={{ style: activeLinkStyle }}>
          dashboard
        </Link>
        <a
          href={SIGNIN_URL}
          style={{ ...linkStyle, marginLeft: 0 }}
        >
          sign in
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

const routeTree = rootRoute.addChildren([homeRoute, howRoute, dashboardRoute]);

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

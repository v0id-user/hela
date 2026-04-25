import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { Signup } from "./routes/Signup";
import { Login } from "./routes/Login";
import { ProjectList } from "./routes/ProjectList";
import { NewProject } from "./routes/NewProject";
import { ProjectDetail } from "./routes/ProjectDetail";
import { ProjectKeys } from "./routes/ProjectKeys";
import { ProjectUsage } from "./routes/ProjectUsage";
import { Billing } from "./routes/Billing";
import { Settings } from "./routes/Settings";
import { account, signout } from "./lib/api";

const rootRoute = createRootRoute({
  component: () => (
    <div style={{ minHeight: "100vh", background: "#111", color: "#c0c0c0" }}>
      <nav
        style={{
          display: "flex",
          gap: 0,
          borderBottom: "1px solid #333",
          alignItems: "center",
          background: "#0a0a0a",
        }}
      >
        <Link to="/" style={linkStyle} activeProps={{ style: activeLinkStyle }}>
          <span style={{ color: "#c9a76a", letterSpacing: 1 }}>[ hela ]</span> projects
        </Link>
        <Link to="/billing" style={linkStyle} activeProps={{ style: activeLinkStyle }}>
          billing
        </Link>
        <Link to="/settings" style={linkStyle} activeProps={{ style: activeLinkStyle }}>
          settings
        </Link>
        <span style={{ marginLeft: "auto" }}>
          <SessionChip />
        </span>
      </nav>
      <Outlet />
    </div>
  ),
});

function SessionChip() {
  const a = account();
  if (!a) return null;
  return (
    <span
      style={{ padding: "6px 12px", color: "#888", fontSize: 11, borderLeft: "1px solid #333" }}
    >
      {a.email}
      <button
        onClick={async () => {
          await signout();
          window.location.href = "/login";
        }}
        style={{ marginLeft: 8, fontSize: 10, padding: "2px 6px" }}
      >
        [ sign out ]
      </button>
    </span>
  );
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

const authed = () => {
  if (!account()) throw redirect({ to: "/login" });
};

const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signup",
  component: Signup,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: Login,
});

const projectListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: authed,
  component: ProjectList,
});

const newProjectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/new",
  beforeLoad: authed,
  component: NewProject,
});

const projectDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$id",
  beforeLoad: authed,
  component: ProjectDetail,
});

const projectKeysRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$id/keys",
  beforeLoad: authed,
  component: ProjectKeys,
});

const projectUsageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$id/usage",
  beforeLoad: authed,
  component: ProjectUsage,
});

const billingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/billing",
  beforeLoad: authed,
  component: Billing,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  beforeLoad: authed,
  component: Settings,
});

const routeTree = rootRoute.addChildren([
  signupRoute,
  loginRoute,
  projectListRoute,
  newProjectRoute,
  projectDetailRoute,
  projectKeysRoute,
  projectUsageRoute,
  billingRoute,
  settingsRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

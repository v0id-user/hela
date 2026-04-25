import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import { bootstrap } from "./lib/api";
import "./index.css";

// Hydrate the session cookie -> account cache before mounting the
// router. The route guards read account() synchronously and assume
// bootstrap has run.
bootstrap().finally(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
});

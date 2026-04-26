import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Plain React + Vite. The marketing and dashboard apps wire the
// React Compiler via @vitejs/plugin-react's babel hook, but the
// docs site is mostly markdown rendering and a small router — the
// compiler payoff is invisible here, and skipping the babel pass
// keeps the docs build dependency-free.
export default defineConfig({
  plugins: [react()],
  // The docs site reads markdown out of the repo's top-level `docs/`
  // directory at build time via `import.meta.glob`. Vite's default
  // root would only see files inside apps/docs/; we point it at the
  // monorepo root so the glob can reach the canonical docs.
  root: __dirname,
  resolve: {
    alias: {
      "@docs": path.resolve(__dirname, "../../docs"),
    },
  },
  // Allow Vite's dev server to serve files from the repo root so
  // `import.meta.glob("/docs/**/*.md")` works in development.
  server: {
    port: 5175,
    fs: {
      allow: [path.resolve(__dirname, "../.."), __dirname],
    },
  },
});

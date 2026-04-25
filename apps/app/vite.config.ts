import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev we proxy /auth and /api to the local control plane so the
// browser sees same-origin requests. That keeps the session cookie's
// SameSite=Lax constraint satisfied without any cookie gymnastics.
//
// React 19 compiler runs via @vitejs/plugin-react's babel hook;
// eslint-plugin-react-compiler at repo root catches bailouts at
// commit time.
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", {}]],
      },
    }),
  ],
  server: {
    port: 5174,
    proxy: {
      "/auth": { target: "http://localhost:4000", changeOrigin: true },
      "/api": { target: "http://localhost:4000", changeOrigin: true },
    },
  },
});

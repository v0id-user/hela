import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev we proxy /auth and /api to the local control plane so the
// browser sees same-origin requests. That keeps the session cookie's
// SameSite=Lax constraint satisfied without any cookie gymnastics.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/auth": { target: "http://localhost:4000", changeOrigin: true },
      "/api": { target: "http://localhost:4000", changeOrigin: true },
    },
  },
});

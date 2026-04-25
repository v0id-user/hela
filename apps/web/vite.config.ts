import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
  server: { port: 5173 },
});

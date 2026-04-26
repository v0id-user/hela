/// <reference types="vite/client" />
// Side-effect imports like `import "./globals.css"` need a declaration
// under TypeScript 6's stricter module resolution. One-liner, same for
// all the bundled asset types.

declare module "*.css";
declare module "*.svg";
declare module "*.png";
declare module "*.jpg";
declare module "highlight.js/styles/github-dark.css";

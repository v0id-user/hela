declare module "*.css";
declare module "*.svg";
declare module "*.png";
declare module "*.jpg";

interface ImportMetaEnv {
  readonly VITE_HELA_CONTROL?: string;
  readonly VITE_HELA_GATEWAY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

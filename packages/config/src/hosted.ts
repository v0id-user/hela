export const HOSTED_ENDPOINTS = {
  production: {
    gateway: "https://gateway-production-bfdf.up.railway.app",
    control: "https://control-production-059e.up.railway.app",
    app: "https://app-production-1716a.up.railway.app",
    web: "https://web-production-f24fc.up.railway.app",
    docs: "https://docs-dev-02b1.up.railway.app",
  },
  dev: {
    gateway: "https://gateway-dev-dev.up.railway.app",
    control: "https://control-dev.up.railway.app",
    app: "https://app-dev-dev-4b3a.up.railway.app",
    web: "https://web-dev-dev-881b.up.railway.app",
    docs: "https://docs-dev-02b1.up.railway.app",
  },
} as const;

export type HostedEnvironment = keyof typeof HOSTED_ENDPOINTS;
export type HostedService = keyof (typeof HOSTED_ENDPOINTS)["production"];

export const REGIONS = [
  { slug: "iad", city: "Ashburn", region: "US East", host: "gateway-production-bfdf.up.railway.app" },
  { slug: "sjc", city: "San Jose", region: "US West", host: "gateway-production-bfdf.up.railway.app" },
  { slug: "ams", city: "Amsterdam", region: "EU", host: "gateway-production-bfdf.up.railway.app" },
  { slug: "sin", city: "Singapore", region: "Asia", host: "gateway-production-bfdf.up.railway.app" },
  { slug: "syd", city: "Sydney", region: "Australia", host: "gateway-production-bfdf.up.railway.app" },
] as const;

export type RegionSlug = (typeof REGIONS)[number]["slug"];

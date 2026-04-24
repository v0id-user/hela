export const REGIONS = [
  { slug: "iad", city: "Ashburn", region: "US East", host: "iad.hela.dev" },
  { slug: "sjc", city: "San Jose", region: "US West", host: "sjc.hela.dev" },
  { slug: "fra", city: "Frankfurt", region: "EU", host: "fra.hela.dev" },
  { slug: "sin", city: "Singapore", region: "Asia", host: "sin.hela.dev" },
  { slug: "syd", city: "Sydney", region: "Australia", host: "syd.hela.dev" },
] as const;

export type RegionSlug = (typeof REGIONS)[number]["slug"];

import { HOSTED_ENDPOINTS } from "@hela/config/hosted";

const HOSTED_GATEWAY_HOST = new URL(HOSTED_ENDPOINTS.production.gateway).host;

export const REGIONS = [
  {
    slug: "iad",
    city: "Ashburn",
    region: "US East",
    host: HOSTED_GATEWAY_HOST,
  },
  {
    slug: "sjc",
    city: "San Jose",
    region: "US West",
    host: HOSTED_GATEWAY_HOST,
  },
  { slug: "ams", city: "Amsterdam", region: "EU", host: HOSTED_GATEWAY_HOST },
  {
    slug: "sin",
    city: "Singapore",
    region: "Asia",
    host: HOSTED_GATEWAY_HOST,
  },
  {
    slug: "syd",
    city: "Sydney",
    region: "Australia",
    host: HOSTED_GATEWAY_HOST,
  },
] as const;

export type RegionSlug = (typeof REGIONS)[number]["slug"];

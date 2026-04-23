import { REGIONS, type Region } from "@hela/sdk-types";

export { REGIONS, type Region };

export function wsUrl(region: Region, endpoint?: string): string {
  if (endpoint) return endpoint.replace(/^http/, "ws") + "/socket";
  const { host } = REGIONS[region];
  const scheme = region === "dev" ? "ws" : "wss";
  return `${scheme}://${host}/socket`;
}

export function httpUrl(region: Region, endpoint?: string): string {
  if (endpoint) return endpoint;
  const { host } = REGIONS[region];
  const scheme = region === "dev" ? "http" : "https";
  return `${scheme}://${host}`;
}

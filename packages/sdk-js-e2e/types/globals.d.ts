// Window augmentation for the debug probe the web app installs at
// runtime (see apps/web/src/lib/hela.ts). The Playwright tests in
// this package drive the app via these globals inside page.evaluate
// callbacks, so the e2e tsconfig needs to know about them.
//
// The shape mirrors apps/web/src/lib/hela.ts — if you add fields
// there, add them here too. (TODO: once a shared internal-types
// package exists, move this into @hela/sdk-types and import from
// both sides.)

export {};

declare global {
  type HelaDebugState = {
    ready: boolean;
    tokenStatus: "idle" | "refreshing" | "ready" | "error";
    tokenExpiresAt: number | null;
    tokenRefreshes: number;
    socketOpens: number;
    socketCloses: number;
    socketErrors: number;
    reconnects: number;
    channelJoined: boolean;
    heroJoinCount: number;
    region: string | null;
    rttMs: number | null;
    lastError: string | null;
  };

  type HelaDebugHandle = HelaDebugState & {
    forceTokenRefresh: () => Promise<void>;
    forceReconnect: () => void;
  };

  interface Window {
    __helaReady?: boolean;
    __helaDebug?: HelaDebugHandle;
  }
}

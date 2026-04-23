import type { Channel as PhxChannel } from "phoenix";
import { HelaPresence } from "./presence.js";
import type { Message, HistoryReply, JoinReply } from "@hela/sdk-types";

export type { Message, HistoryReply, JoinReply };

/**
 * Wrapper over a Phoenix.Channel. Adds hela-specific helpers for
 * publishing, history, and the convenience presence instance.
 */
export class HelaChannel {
  readonly name: string;
  readonly projectId: string;
  readonly raw: PhxChannel;
  readonly presence: HelaPresence;

  constructor(raw: PhxChannel, name: string, projectId: string) {
    this.raw = raw;
    this.name = name;
    this.projectId = projectId;
    this.presence = new HelaPresence(raw);
  }

  /** Join the channel. Resolves with the initial history + metadata. */
  join(timeoutMs = 10_000): Promise<JoinReply> {
    return new Promise((resolve, reject) => {
      this.raw
        .join(timeoutMs)
        .receive("ok", (r: JoinReply) => resolve(r))
        .receive("error", (e) => reject(e))
        .receive("timeout", () => reject(new Error("join timeout")));
    });
  }

  leave(): void {
    this.raw.leave();
  }

  /** Publish a message to this channel. Resolves with the server-assigned id. */
  publish(
    body: string,
    opts?: { author?: string; replyTo?: string; timeoutMs?: number }
  ): Promise<{ id: string; quota: "ok" | "over" }> {
    return this.pushP("publish", { body, author: opts?.author, reply_to_id: opts?.replyTo }, opts?.timeoutMs);
  }

  /** Fetch older messages. `before` is a message id returned by the server. */
  history(opts?: { before?: string; limit?: number; timeoutMs?: number }): Promise<HistoryReply> {
    return this.pushP("history", { before: opts?.before, limit: opts?.limit }, opts?.timeoutMs);
  }

  /** Subscribe to incoming messages. Returns an unsubscribe function. */
  onMessage(cb: (m: Message) => void): () => void {
    const ref = this.raw.on("message", cb);
    return () => this.raw.off("message", ref);
  }

  /** Change your presence-roster nickname without re-joining. */
  setNickname(nickname: string, timeoutMs?: number): Promise<void> {
    return this.pushP("set_nick", { nickname }, timeoutMs);
  }

  /**
   * Thin wrapper around Phoenix.Channel.push that always resolves or
   * rejects — never hangs. Every SDK call flows through this so a dropped
   * reply can't deadlock the caller.
   */
  private pushP<T>(event: string, payload: unknown, timeoutMs = 10_000): Promise<T> {
    return new Promise((resolve, reject) => {
      this.raw
        .push(event, payload as object, timeoutMs)
        .receive("ok", (r: T) => resolve(r))
        .receive("error", (e) => reject(e))
        .receive("timeout", () =>
          reject(Object.assign(new Error(`${event} timeout`), { reason: "timeout", event }))
        );
    });
  }
}

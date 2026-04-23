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
    opts?: { author?: string; replyTo?: string }
  ): Promise<{ id: string; quota: "ok" | "over" }> {
    return new Promise((resolve, reject) => {
      this.raw
        .push("publish", { body, author: opts?.author, reply_to_id: opts?.replyTo })
        .receive("ok", (r) => resolve(r))
        .receive("error", (e) => reject(e));
    });
  }

  /** Fetch older messages. `before` is a message id returned by the server. */
  history(opts?: { before?: string; limit?: number }): Promise<HistoryReply> {
    return new Promise((resolve, reject) => {
      this.raw
        .push("history", { before: opts?.before, limit: opts?.limit })
        .receive("ok", (r: HistoryReply) => resolve(r))
        .receive("error", (e) => reject(e));
    });
  }

  /** Subscribe to incoming messages. Returns an unsubscribe function. */
  onMessage(cb: (m: Message) => void): () => void {
    const ref = this.raw.on("message", cb);
    return () => this.raw.off("message", ref);
  }

  /** Change your presence-roster nickname without re-joining. */
  setNickname(nickname: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.raw
        .push("set_nick", { nickname })
        .receive("ok", () => resolve())
        .receive("error", (e) => reject(e));
    });
  }
}

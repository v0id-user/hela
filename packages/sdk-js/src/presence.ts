import { Presence as PhxPresence } from "phoenix";
import type { Channel as PhxChannel } from "phoenix";
import type { PresenceEntry } from "@hela/sdk-types";

export type { PresenceEntry };

/**
 * Live roster view for a channel. Phoenix.Presence is CRDT-backed, so
 * joins/leaves on any node in the region arrive here without us doing
 * anything.
 */
export class HelaPresence {
  private p: PhxPresence;
  private handlers = new Set<(entries: PresenceEntry[]) => void>();

  constructor(channel: PhxChannel) {
    this.p = new PhxPresence(channel);
    this.p.onSync(() => this.fire());
  }

  /** Subscribe to the sorted roster; fires on every sync. */
  onSync(cb: (entries: PresenceEntry[]) => void): () => void {
    this.handlers.add(cb);
    // fire immediately with current state so subscribers don't have to
    // wait for the next server event.
    cb(this.list());
    return () => this.handlers.delete(cb);
  }

  list(): PresenceEntry[] {
    return this.p.list((id: string, entry: { metas: PresenceEntry["metas"] }) => ({
      id,
      metas: entry.metas,
    }));
  }

  private fire() {
    const entries = this.list();
    for (const h of this.handlers) h(entries);
  }
}

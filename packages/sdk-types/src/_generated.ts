// Auto-generated from packages/schemas/wire/. Do not edit.
// Run `make sdk.gen` after changing a schema.
//
// quicktype emits a top-level `Wire` interface with every event
// as an optional field. It is a place-holder; consumers should
// import individual types (`Message`, `JoinReply`, etc.) by name.

/**
 * Umbrella schema that references every WS event. This is the entry point datamodel-codegen
 * (and other tools) read to emit a single types module covering the whole WS surface in one
 * file.
 */
export interface Wire {
  error?: ErrorReply;
  history_reply?: HistoryReply;
  history_request?: HistoryRequest;
  join_reply?: JoinReply;
  join_request?: JoinRequest;
  message?: Message;
  presence_diff?: PresenceDiff;
  presence_state?: { [key: string]: Entry };
  publish_reply?: PublishReply;
  publish_request?: PublishRequest;
  [property: string]: any;
}

/**
 * Generic shape for error replies on the channel (status="error" phx_reply).
 */
export interface ErrorReply {
  /**
   * Short machine-readable error code. Known values: `body_too_large`, `unauthorized_read`,
   * `unauthorized_write`, `project_mismatch`, `rate_limited`, `bad_topic`.
   */
  reason: string;
  /**
   * Present when `reason == rate_limited`. Milliseconds until the current rate bucket resets.
   */
  retry_after_ms?: number;
  [property: string]: any;
}

/**
 * Ordered oldest → newest. `source` tells the client where the page came from so it can
 * show cache-hit rate in dashboards or switch strategy.
 */
export interface HistoryReply {
  messages: Message[];
  /**
   * `cache`: entirely from ETS hot-tier. `mixed`: cache + Postgres topup. `db`: cache miss,
   * Postgres fall-through.
   */
  source: Source;
}

/**
 * A single published message, as it arrives on a subscriber. Canonical shape emitted by
 * Hela.Chat.Message.to_wire/1.
 */
export interface Message {
  /**
   * Opaque author identifier. Whatever the publisher passed.
   */
  author: string;
  /**
   * The payload. Up to 4KB.
   */
  body: string;
  /**
   * The logical channel name (no project prefix).
   */
  channel: string;
  /**
   * UUIDv7. First 48 bits are unix-ms; lexicographic order = chronological.
   */
  id: string;
  /**
   * ISO-8601 UTC timestamp. Same time as the id's embedded ms, to microsecond precision.
   */
  inserted_at: string;
  /**
   * Erlang node name that accepted the publish. Mostly for ops; clients can ignore.
   */
  node: string;
  /**
   * If set, the id of the message this is a reply to. Same UUIDv7 shape.
   */
  reply_to_id?: null | string;
}

/**
 * `cache`: entirely from ETS hot-tier. `mixed`: cache + Postgres topup. `db`: cache miss,
 * Postgres fall-through.
 *
 * Where the seed history came from — same semantics as history_reply.source.
 */
export enum Source {
  Cache = "cache",
  DB = "db",
  Mixed = "mixed",
}

/**
 * Cursor-paginated history query. `before` is a message id from the previous page; omit to
 * get the latest N.
 */
export interface HistoryRequest {
  /**
   * Cursor — UUIDv7 of the oldest message on the previous page. Inclusive start, exclusive
   * `before`.
   */
  before?: string;
  limit?: number;
}

/**
 * Server's reply to `phx_join`. Seeds the client with the most recent 50 messages + the
 * cluster metadata.
 */
export interface JoinReply {
  /**
   * Most-recent-50 history, oldest first. Cache-hit preferred.
   */
  messages: Message[];
  /**
   * Erlang node name that served the join. Useful when debugging distributed behavior.
   */
  node: string;
  /**
   * The region this gateway reports as (e.g. `iad`). Use it to pick the right region in the
   * SDK config next time.
   */
  region: string;
  /**
   * Where the seed history came from — same semantics as history_reply.source.
   */
  source: Source;
}

/**
 * Payload for `phx_join` on a `chan:<project>:<channel>` topic.
 */
export interface JoinRequest {
  /**
   * Display name used for presence roster + default author on publishes.
   */
  nickname?: string;
}

/**
 * Incremental presence update. Apply to local state: leaves first, then joins. Clients that
 * need full state should still initialize from presence_state on join.
 */
export interface PresenceDiff {
  joins?: { [key: string]: Entry };
  leaves?: { [key: string]: Entry };
}

export interface Entry {
  metas: Meta[];
}

export interface Meta {
  /**
   * Erlang node that owns this connection.
   */
  node: string;
  /**
   * Unix seconds — when this meta was first tracked.
   */
  online_at: number;
  /**
   * Internal tracker ref; carried so the CRDT can tell entries apart.
   */
  phx_ref?: string;
  /**
   * Region slug of the gateway.
   */
  region?: string;
  [property: string]: any;
}

/**
 * Server's reply to a publish event.
 */
export interface PublishReply {
  /**
   * The UUIDv7 the server minted for this message.
   */
  id: string;
  /**
   * Was this message within the project's monthly cap? `over` means delivered + persisted,
   * but metered for overage billing.
   */
  quota: Quota;
}

/**
 * Was this message within the project's monthly cap? `over` means delivered + persisted,
 * but metered for overage billing.
 */
export enum Quota {
  Ok = "ok",
  Over = "over",
}

/**
 * Outgoing publish frame. Goes as the `publish` event payload on a joined channel.
 */
export interface PublishRequest {
  /**
   * Optional author override. Defaults to the channel's joined nickname.
   */
  author?: string;
  /**
   * The message body. Rejected if over 4KB.
   */
  body: string;
  /**
   * Optional. UUIDv7 of the message this replies to.
   */
  reply_to_id?: string;
}

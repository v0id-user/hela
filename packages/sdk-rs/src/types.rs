//! Wire + REST types, hand-written from `packages/schemas/`.
//!
//! Every struct mirrors one schema in `packages/schemas/wire/` or a
//! body shape in `packages/schemas/openapi.yaml`. Field names on the
//! wire are snake_case; `serde` derives `rename_all = "snake_case"`
//! is redundant because that's the rust convention too, but we pin
//! it explicitly so a future struct field rename can't accidentally
//! drift the wire.
//!
//! Drift is caught by `tests/types.rs` round-tripping real payloads
//! and by the `schema-drift` guard in CI.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

fn serde_skip_false(b: &bool) -> bool {
    !*b
}

// ----- WS: message -------------------------------------------------------

/// A single published message, as it arrives on a subscriber. Canonical
/// shape emitted by `Hela.Chat.Message.to_wire/1`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Message {
    /// UUIDv7. First 48 bits are unix-ms; lexicographic order =
    /// chronological.
    pub id: String,
    pub channel: String,
    pub author: String,
    pub body: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reply_to_id: Option<String>,
    pub node: String,
    pub inserted_at: DateTime<Utc>,
}

// ----- WS: publish -------------------------------------------------------

/// Outgoing publish frame. Body capped at 4 KB server-side.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PublishRequest {
    pub body: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reply_to_id: Option<String>,
}

/// Was this message within the project's monthly cap? `Over` means
/// delivered + persisted, but metered for overage billing.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Quota {
    Ok,
    Over,
}

/// Server's reply to a `publish` WS event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublishReply {
    pub id: String,
    pub quota: Quota,
}

// ----- WS: history ------------------------------------------------------

/// Cursor-paginated history query. `before` is a message id from the
/// previous page; omit for the latest N.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HistoryRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub before: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
}

/// Where a history page came from.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HistorySource {
    /// Entirely from the ETS hot-tier.
    Cache,
    /// ETS + Postgres topup.
    Mixed,
    /// Cache miss; fell through to Postgres.
    Db,
}

/// Ordered oldest → newest.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryReply {
    pub source: HistorySource,
    pub messages: Vec<Message>,
}

// ----- WS: join ---------------------------------------------------------

/// Payload for `phx_join` on a `chan:<project>:<channel>` topic.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct JoinRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub nickname: Option<String>,
}

/// Server's reply to `phx_join`. Seeds the client with the most
/// recent 50 messages plus cluster metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JoinReply {
    pub messages: Vec<Message>,
    pub source: HistorySource,
    pub region: String,
    pub node: String,
}

// ----- WS: presence -----------------------------------------------------

/// One metadata record per live connection for a user. `phx_ref` is
/// the Phoenix tracker ref that identifies this specific connection so
/// the CRDT can merge duplicate users cleanly.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresenceMeta {
    pub online_at: i64,
    pub node: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub region: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phx_ref: Option<String>,

    /// Any additional per-connection metadata the server or other
    /// clients attached. Custom app data lives here.
    #[serde(flatten)]
    pub extras: HashMap<String, serde_json::Value>,
}

// ----- WS: error reply --------------------------------------------------

/// Generic shape for phx_reply error payloads. Known reasons:
/// body_too_large, unauthorized_read, unauthorized_write,
/// project_mismatch, rate_limited, bad_topic.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorReply {
    pub reason: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub retry_after_ms: Option<u32>,
}

// ----- REST: tokens -----------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenRequest {
    pub sub: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chans: Option<Vec<Vec<String>>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ttl_seconds: Option<u32>,
    #[serde(default, skip_serializing_if = "serde_skip_false")]
    pub ephemeral: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenResponse {
    pub token: String,
    pub expires_in: u32,
}

// ----- REST: publish / history ------------------------------------------

/// REST equivalent of `PublishReply`; adds `inserted_at` which is
/// redundant on the WS reply (the id carries the same timestamp).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublishResponse {
    pub id: String,
    pub inserted_at: DateTime<Utc>,
    pub quota: Quota,
}

// ----- REST: playground -------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaygroundTokenScope {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pattern: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaygroundToken {
    pub token: String,
    pub project_id: String, // always "proj_public"
    pub expires_in: u32,
    pub scopes: Vec<PlaygroundTokenScope>,
    #[serde(default, skip_serializing_if = "serde_skip_false")]
    pub ephemeral: bool,
}

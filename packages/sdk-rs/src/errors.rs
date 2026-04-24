//! SDK-level error type. One `Error` that carries an `ErrorKind` enum
//! so callers can `match` on the variant they care about, while still
//! getting a source chain and a display impl for `?`.
//!
//! ```no_run
//! # async fn run(chat: &hela::Channel) {
//! match chat.publish(hela::PublishRequest { body: "x".into(), ..Default::default() }).await {
//!     Ok(_) => {}
//!     Err(e) => match e.kind() {
//!         hela::ErrorKind::RateLimited { retry_after_ms } => {
//!             tokio::time::sleep(std::time::Duration::from_millis(*retry_after_ms as u64)).await;
//!         }
//!         hela::ErrorKind::Unauthorized => { /* re-mint JWT */ }
//!         _ => eprintln!("{e}"),
//!     },
//! }
//! # }
//! ```

use std::collections::HashMap;
use thiserror::Error;

/// Everything the SDK returns. `kind()` exposes the enum for matching.
#[derive(Debug, Error)]
#[error("hela: {kind}")]
pub struct Error {
    kind: ErrorKind,
    #[source]
    source: Option<Box<dyn std::error::Error + Send + Sync + 'static>>,
}

impl Error {
    pub fn new(kind: ErrorKind) -> Self {
        Self { kind, source: None }
    }

    pub fn with_source<E: std::error::Error + Send + Sync + 'static>(
        kind: ErrorKind,
        source: E,
    ) -> Self {
        Self {
            kind,
            source: Some(Box::new(source)),
        }
    }

    pub fn kind(&self) -> &ErrorKind {
        &self.kind
    }

    pub fn into_kind(self) -> ErrorKind {
        self.kind
    }
}

/// Discriminant for `Error`. Kept stable; adding variants is additive.
#[derive(Debug, Clone, Error, PartialEq, Eq)]
pub enum ErrorKind {
    /// 401 on REST or `{status: error, reason: unauthorized}` on WS.
    #[error("unauthorized")]
    Unauthorized,

    /// Per-second publish cap exceeded. `retry_after_ms` tells you how
    /// long to back off.
    #[error("rate limited (retry after {retry_after_ms} ms)")]
    RateLimited { retry_after_ms: u32 },

    /// Push didn't get a reply inside the timeout.
    #[error("{event} on {topic} timed out")]
    Timeout { event: String, topic: String },

    /// Any other `phx_reply` error. `reason` is machine-readable;
    /// `payload` is the full error reply for debugging.
    #[error("server error: {reason}")]
    ServerError {
        reason: String,
        payload: HashMap<String, serde_json::Value>,
    },

    /// Transport-level failure (dial, send, read).
    #[error("transport: {0}")]
    Transport(String),

    /// Bad/unparseable server payload.
    #[error("protocol: {0}")]
    Protocol(String),

    /// Config validation — unknown region, missing token, etc.
    #[error("config: {0}")]
    Config(String),
}

// Convenience conversions so `?` works on common internal errors.

impl From<serde_json::Error> for Error {
    fn from(e: serde_json::Error) -> Self {
        Self::with_source(ErrorKind::Protocol(e.to_string()), e)
    }
}

impl From<reqwest::Error> for Error {
    fn from(e: reqwest::Error) -> Self {
        Self::with_source(ErrorKind::Transport(e.to_string()), e)
    }
}

impl From<tokio_tungstenite::tungstenite::Error> for Error {
    fn from(e: tokio_tungstenite::tungstenite::Error) -> Self {
        Self::with_source(ErrorKind::Transport(e.to_string()), e)
    }
}

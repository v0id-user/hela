//! # hela
//!
//! Rust SDK for [hela](https://github.com/v0id-user/hela) — managed real-time on BEAM.
//!
//! ```no_run
//! use hela::{Config, Region};
//!
//! # async fn run() -> Result<(), hela::Error> {
//! let client = hela::connect(Config {
//!     region: Region::Iad,
//!     token: Some("eyJhbGc...".into()),
//!     ..Default::default()
//! }).await?;
//!
//! let chat = client.channel("chat:lobby");
//! chat.on_message(|msg| println!("{}: {}", msg.author, msg.body));
//! chat.join(hela::JoinRequest { nickname: Some("alice".into()) }).await?;
//! chat.publish(hela::PublishRequest { body: "hello".into(), ..Default::default() }).await?;
//! # Ok(()) }
//! ```
//!
//! See `docs/sdk/rust.md` in the main repo for the full guide.

#![forbid(unsafe_code)]

mod channel;
mod client;
mod errors;
mod presence;
mod rest;
mod transport;
mod types;

pub use channel::Channel;
pub use client::{connect, Client, Config, Region};
pub use errors::{Error, ErrorKind};
pub use presence::{Presence, PresenceEntry, PresenceHandler};
pub use rest::{Rest, RestOptions};
pub use types::{
    ErrorReply, HistoryReply, HistoryRequest, HistorySource, JoinReply, JoinRequest, Message,
    PlaygroundToken, PlaygroundTokenScope, PresenceMeta, PublishReply, PublishRequest,
    PublishResponse, Quota, TokenRequest, TokenResponse,
};

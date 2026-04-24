//! REST helpers for server-side use: minting tokens, publishing from a
//! cron job, fetching history out-of-band. Wraps `reqwest::Client`.

use crate::errors::{Error, ErrorKind};
use crate::types::{
    HistoryReply, HistoryRequest, PlaygroundToken, PublishRequest, PublishResponse, TokenRequest,
    TokenResponse,
};
use reqwest::{Response, StatusCode};
use std::collections::HashMap;
use std::time::Duration;

/// Configuration for [`Rest::new`]. Provide an API key for
/// authenticated endpoints; pass a custom [`reqwest::Client`] via
/// [`RestOptions::http`] if you want retries, metrics, or pool
/// sharing with the rest of your app.
#[derive(Debug, Default)]
pub struct RestOptions {
    pub api_key: Option<String>,
    pub http: Option<reqwest::Client>,
}

/// REST client. One per base URL; safe to share across tasks.
pub struct Rest {
    base: String,
    api_key: Option<String>,
    client: reqwest::Client,
}

impl Rest {
    pub fn new(base_url: impl Into<String>, opts: RestOptions) -> Self {
        let base = base_url.into().trim_end_matches('/').to_string();
        let client = opts.http.unwrap_or_else(|| {
            reqwest::Client::builder()
                .timeout(Duration::from_secs(15))
                .build()
                .expect("reqwest client")
        });
        Self {
            base,
            api_key: opts.api_key,
            client,
        }
    }

    /// Ask the gateway to sign a short-lived HS256 JWT scoped to this
    /// project. Use it on the WebSocket `token` param.
    pub async fn mint_token(&self, mut req: TokenRequest) -> Result<TokenResponse, Error> {
        if req.ttl_seconds.is_none() {
            req.ttl_seconds = Some(3600);
        }
        self.post("/v1/tokens", &req, true).await
    }

    /// Issue a guest token for the public sandbox project. No API key
    /// required.
    pub async fn playground_token(&self, sub: Option<&str>) -> Result<PlaygroundToken, Error> {
        self.playground_token_ephemeral(sub, false).await
    }

    /// Like [`Self::playground_token`], with optional broadcast-only `ephemeral` mode.
    pub async fn playground_token_ephemeral(
        &self,
        sub: Option<&str>,
        ephemeral: bool,
    ) -> Result<PlaygroundToken, Error> {
        let mut body = serde_json::Map::new();
        if let Some(s) = sub {
            body.insert("sub".into(), s.into());
        }
        if ephemeral {
            body.insert("ephemeral".into(), true.into());
        }
        self.post("/playground/token", &body, false).await
    }

    /// Server-side publish. Bypasses the WS entirely — useful from
    /// cron jobs or background workers.
    pub async fn publish(
        &self,
        channel: &str,
        req: PublishRequest,
    ) -> Result<PublishResponse, Error> {
        let path = format!("/v1/channels/{}/publish", urlencode_path(channel));
        self.post(&path, &req, true).await
    }

    /// Cursor-paginated history via REST.
    pub async fn history(&self, channel: &str, req: HistoryRequest) -> Result<HistoryReply, Error> {
        let limit = req.limit.unwrap_or(50);
        let mut params = HashMap::new();
        params.insert("limit", limit.to_string());
        if let Some(before) = req.before {
            params.insert("before", before);
        }
        let path = format!("/v1/channels/{}/history", urlencode_path(channel));
        self.get(&path, &params).await
    }

    // --- internal HTTP --------------------------------------------

    async fn post<T: serde::Serialize, R: serde::de::DeserializeOwned>(
        &self,
        path: &str,
        body: &T,
        auth: bool,
    ) -> Result<R, Error> {
        let url = format!("{}{}", self.base, path);
        let mut req = self.client.post(&url).json(body);
        if auth {
            if let Some(k) = &self.api_key {
                req = req.bearer_auth(k);
            }
        }
        self.handle(req.send().await?).await
    }

    async fn get<R: serde::de::DeserializeOwned>(
        &self,
        path: &str,
        params: &HashMap<&str, String>,
    ) -> Result<R, Error> {
        let url = format!("{}{}", self.base, path);
        let mut req = self.client.get(&url);
        if let Some(k) = &self.api_key {
            req = req.bearer_auth(k);
        }
        if !params.is_empty() {
            let q: Vec<(&&str, &String)> = params.iter().collect();
            req = req.query(&q);
        }
        self.handle(req.send().await?).await
    }

    async fn handle<R: serde::de::DeserializeOwned>(&self, r: Response) -> Result<R, Error> {
        match r.status() {
            StatusCode::UNAUTHORIZED => Err(Error::new(ErrorKind::Unauthorized)),
            StatusCode::TOO_MANY_REQUESTS => {
                // Parse {"retry_after_ms": N} tolerantly — still return
                // RateLimited even if the body is garbage, just with 0.
                let body = r.text().await.unwrap_or_default();
                let retry = serde_json::from_str::<serde_json::Value>(&body)
                    .ok()
                    .and_then(|v| v.get("retry_after_ms").and_then(|x| x.as_u64()))
                    .unwrap_or(0) as u32;
                Err(Error::new(ErrorKind::RateLimited {
                    retry_after_ms: retry,
                }))
            }
            s if s.is_client_error() || s.is_server_error() => {
                let text = r.text().await.unwrap_or_default();
                Err(Error::new(ErrorKind::Transport(format!(
                    "HTTP {}: {}",
                    s.as_u16(),
                    text
                ))))
            }
            _ => Ok(r.json::<R>().await?),
        }
    }
}

fn urlencode_path(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b':' => {
                out.push(*b as char)
            }
            b'/' => out.push('/'),
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

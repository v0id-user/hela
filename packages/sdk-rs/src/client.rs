//! Public entry point. `connect()` is the shortest path; `Client` is
//! the type most apps reach for.

use crate::channel::Channel;
use crate::errors::Error;
use crate::transport::Socket;
use base64::Engine;
use std::collections::HashMap;
use std::sync::Arc;

/// Hosted cluster slug, plus `Dev` for localhost.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
pub enum Region {
    #[default]
    Iad,
    Sjc,
    Ams,
    Sin,
    Syd,
    Dev,
}

impl Region {
    fn host(self) -> &'static str {
        match self {
            Region::Iad => "iad.hela.dev",
            Region::Sjc => "sjc.hela.dev",
            Region::Ams => "ams.hela.dev",
            Region::Sin => "sin.hela.dev",
            Region::Syd => "syd.hela.dev",
            Region::Dev => "localhost:4001",
        }
    }
}

/// Everything `connect()` needs.
#[derive(Debug, Clone, Default)]
pub struct Config {
    pub region: Region,
    /// Customer JWT minted via `/v1/tokens`. Preferred.
    pub token: Option<String>,
    /// 5-minute guest token from `/playground/token`. For demos.
    pub playground_token: Option<String>,
    /// Override the computed host. Use with `Region::Dev` for a local
    /// gateway (e.g. `"http://localhost:4001"`).
    pub endpoint: Option<String>,
}

/// Owns one WebSocket, multiplexing every channel over it.
pub struct Client {
    cfg: Config,
    pub(crate) sock: Arc<Socket>,
    project_id: String,
}

/// Build a client, open the socket, return. Most apps use this.
pub async fn connect(cfg: Config) -> Result<Client, Error> {
    let mut params = HashMap::new();
    params.insert("vsn".into(), "2.0.0".into());
    if let Some(t) = &cfg.token {
        params.insert("token".into(), t.clone());
    }
    if let Some(t) = &cfg.playground_token {
        params.insert("playground".into(), t.clone());
    }

    let project_id = peek_project_id(cfg.token.as_deref().or(cfg.playground_token.as_deref()));
    let ws_url = ws_url(&cfg);

    let sock = Socket::connect(&ws_url, &params).await?;
    Ok(Client {
        cfg,
        sock: Arc::new(sock),
        project_id,
    })
}

impl Client {
    /// Create a channel handle bound to this client. Doesn't send any
    /// frames until [`Channel::join`] is called.
    pub fn channel(&self, name: &str) -> Channel {
        let pid = if self.project_id.is_empty() {
            "proj_public".to_string()
        } else {
            self.project_id.clone()
        };
        let topic = format!("chan:{}:{}", pid, name);
        Channel::new(self.sock.clone(), topic, name.to_string(), pid)
    }

    /// Shut down the socket and the spawned reader + heartbeat tasks.
    pub async fn close(&self) {
        self.sock.close().await;
    }

    pub fn region(&self) -> Region {
        self.cfg.region
    }

    pub fn http_url(&self) -> String {
        if let Some(ep) = &self.cfg.endpoint {
            return ep.clone();
        }
        let scheme = if self.cfg.region == Region::Dev {
            "http"
        } else {
            "https"
        };
        format!("{}://{}", scheme, self.cfg.region.host())
    }
}

fn ws_url(cfg: &Config) -> String {
    let base = if let Some(ep) = &cfg.endpoint {
        ep.clone()
    } else {
        let scheme = if cfg.region == Region::Dev {
            "http"
        } else {
            "https"
        };
        format!("{}://{}", scheme, cfg.region.host())
    };
    let ws = if let Some(rest) = base.strip_prefix("https://") {
        format!("wss://{}", rest)
    } else if let Some(rest) = base.strip_prefix("http://") {
        format!("ws://{}", rest)
    } else {
        base
    };
    format!("{}/socket/websocket", ws)
}

/// Decode the JWT `pid` claim without verifying. Safe for HS256 +
/// RS256 alike; server remains the only verifier. Returns empty
/// string on any failure.
pub(crate) fn peek_project_id(jwt: Option<&str>) -> String {
    let Some(jwt) = jwt else { return String::new() };
    if jwt.is_empty() {
        return String::new();
    }
    let segs: Vec<&str> = jwt.splitn(3, '.').collect();
    if segs.len() < 2 {
        return String::new();
    }
    let engine = base64::engine::general_purpose::URL_SAFE_NO_PAD;
    let decoded = engine
        .decode(segs[1])
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(segs[1]));
    let Ok(decoded) = decoded else {
        return String::new();
    };
    let Ok(parsed) = serde_json::from_slice::<serde_json::Value>(&decoded) else {
        return String::new();
    };
    parsed
        .get("pid")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

// --- public helpers -----------------------------------------------------

impl Region {
    /// Bare host for this region, no scheme. Useful when building
    /// secondary URLs (e.g. for a custom dashboard).
    pub fn hostname(self) -> &'static str {
        self.host()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;
    use serde_json::json;

    fn mk_jwt(claims: serde_json::Value) -> String {
        let header = json!({"alg": "HS256", "typ": "JWT"});
        let e = base64::engine::general_purpose::URL_SAFE_NO_PAD;
        format!(
            "{}.{}.sig",
            e.encode(header.to_string()),
            e.encode(claims.to_string())
        )
    }

    #[test]
    fn peek_pid_happy_path() {
        let jwt = mk_jwt(json!({"pid": "proj_abc123", "sub": "u1"}));
        assert_eq!(peek_project_id(Some(&jwt)), "proj_abc123");
    }

    #[test]
    fn peek_pid_missing() {
        let jwt = mk_jwt(json!({"sub": "u1"}));
        assert_eq!(peek_project_id(Some(&jwt)), "");
    }

    #[test]
    fn peek_pid_empty_or_none() {
        assert_eq!(peek_project_id(None), "");
        assert_eq!(peek_project_id(Some("")), "");
    }

    #[test]
    fn peek_pid_malformed() {
        assert_eq!(peek_project_id(Some("one.segment")), "");
        assert_eq!(peek_project_id(Some("just-text")), "");
    }

    #[test]
    fn peek_pid_non_string_rejected() {
        // pid must be a string — numeric claim is rejected
        let jwt = mk_jwt(json!({"pid": 12345}));
        assert_eq!(peek_project_id(Some(&jwt)), "");
    }

    #[test]
    fn http_url_per_region() {
        for (region, want) in [
            (Region::Iad, "https://iad.hela.dev"),
            (Region::Sjc, "https://sjc.hela.dev"),
            (Region::Ams, "https://ams.hela.dev"),
            (Region::Sin, "https://sin.hela.dev"),
            (Region::Syd, "https://syd.hela.dev"),
            (Region::Dev, "http://localhost:4001"),
        ] {
            let cfg = Config {
                region,
                ..Default::default()
            };
            let base = if let Some(ep) = &cfg.endpoint {
                ep.clone()
            } else {
                let scheme = if cfg.region == Region::Dev {
                    "http"
                } else {
                    "https"
                };
                format!("{}://{}", scheme, cfg.region.host())
            };
            assert_eq!(base, want);
        }
    }

    #[test]
    fn ws_url_swaps_scheme_and_appends_path() {
        let cfg = Config {
            region: Region::Iad,
            ..Default::default()
        };
        assert_eq!(ws_url(&cfg), "wss://iad.hela.dev/socket/websocket");

        let cfg = Config {
            region: Region::Dev,
            ..Default::default()
        };
        assert_eq!(ws_url(&cfg), "ws://localhost:4001/socket/websocket");
    }

    #[test]
    fn ws_url_respects_endpoint_override() {
        let cfg = Config {
            region: Region::Dev,
            endpoint: Some("http://127.0.0.1:9999".into()),
            ..Default::default()
        };
        assert_eq!(ws_url(&cfg), "ws://127.0.0.1:9999/socket/websocket");
    }
}

//! Phoenix Channel v2 transport. Not exposed to users — `Client` wraps
//! it with the domain API. One WebSocket, multiplexing many channels.
//!
//! Wire format, from phoenix.js source:
//!
//! ```text
//! outgoing: [join_ref, ref, topic, event, payload]
//! incoming: [join_ref | null, ref | null, topic, event, payload]
//! ```
//!
//! `ref` is client-chosen and monotonic per outbound frame; replies
//! echo it back and that's how we correlate pushes to responses.
//! `join_ref` is the ref of the phx_join that opened the topic; every
//! subsequent frame on that topic reuses it.

use crate::errors::{Error, ErrorKind};
use crate::types::ErrorReply;
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio_tungstenite::tungstenite::protocol::Message as WsMessage;

pub(crate) type EventHandler = Arc<dyn Fn(String, Value) + Send + Sync + 'static>;

pub(crate) struct Socket {
    writer: Arc<Mutex<mpsc::Sender<String>>>,
    state: Arc<SocketState>,
}

struct SocketState {
    ref_counter: AtomicU64,
    subs: Mutex<HashMap<String, Subscription>>,
    heartbeat_pending: Mutex<HashMap<String, oneshot::Sender<()>>>,
}

struct Subscription {
    join_ref: String,
    on_event: EventHandler,
    pending: HashMap<String, oneshot::Sender<PushResult>>,
}

type PushResult = Result<Value, Error>;

impl Socket {
    /// Dials `url` with the given query params, spawns reader + heartbeat
    /// tasks. Returns once the WS handshake completes.
    pub async fn connect(url: &str, params: &HashMap<String, String>) -> Result<Self, Error> {
        let full_url = build_url(url, params);

        let (ws, _) = tokio_tungstenite::connect_async(&full_url)
            .await
            .map_err(|e| Error::with_source(ErrorKind::Transport(e.to_string()), e))?;

        let (sink, stream) = ws.split();

        // Outbound queue so callers don't contend on the sink.
        let (tx, mut rx) = mpsc::channel::<String>(64);
        tokio::spawn(async move {
            let mut sink = sink;
            while let Some(frame) = rx.recv().await {
                if sink.send(WsMessage::text(frame)).await.is_err() {
                    break;
                }
            }
            let _ = sink.close().await;
        });

        let state = Arc::new(SocketState {
            ref_counter: AtomicU64::new(0),
            subs: Mutex::new(HashMap::new()),
            heartbeat_pending: Mutex::new(HashMap::new()),
        });

        // Reader loop: parse every incoming frame and dispatch.
        let reader_state = state.clone();
        tokio::spawn(async move {
            let mut stream = stream;
            while let Some(msg) = stream.next().await {
                let Ok(msg) = msg else {
                    break;
                };
                let text = match msg {
                    WsMessage::Text(t) => t.to_string(),
                    WsMessage::Binary(b) => String::from_utf8_lossy(&b).into_owned(),
                    WsMessage::Close(_) => break,
                    _ => continue,
                };
                let Ok(frame): Result<Vec<Value>, _> = serde_json::from_str(&text) else {
                    continue;
                };
                if frame.len() != 5 {
                    continue;
                }
                dispatch(&reader_state, frame).await;
            }
        });

        // Heartbeat loop: Phoenix wants one on `phoenix` topic every 30s.
        let hb_state = state.clone();
        let hb_tx = tx.clone();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(Duration::from_secs(30));
            tick.tick().await; // skip the immediate first fire
            loop {
                tick.tick().await;
                let r = next_ref(&hb_state);
                let (ack_tx, ack_rx) = oneshot::channel();
                hb_state
                    .heartbeat_pending
                    .lock()
                    .await
                    .insert(r.clone(), ack_tx);
                let frame = serde_json::json!([null, r, "phoenix", "heartbeat", {}]).to_string();
                if hb_tx.send(frame).await.is_err() {
                    return;
                }
                // wait up to 10s for ack; if nothing comes, the reader will
                // tear down and the next heartbeat tick returns when the
                // channel is closed.
                if tokio::time::timeout(Duration::from_secs(10), ack_rx)
                    .await
                    .is_err()
                {
                    hb_state.heartbeat_pending.lock().await.remove(&r);
                }
            }
        });

        Ok(Self {
            writer: Arc::new(Mutex::new(tx)),
            state,
        })
    }

    /// Close the socket by dropping the writer channel — the writer
    /// task sees the close and closes the sink. Pending pushes abort
    /// with a transport error.
    pub async fn close(&self) {
        let mut pending_subs = self.state.subs.lock().await;
        for (_, sub) in pending_subs.iter_mut() {
            for (_, ch) in sub.pending.drain() {
                let _ = ch.send(Err(Error::new(ErrorKind::Transport(
                    "socket closed".into(),
                ))));
            }
        }
        pending_subs.clear();
        // drop the writer sender half; the writer task will see it and
        // call sink.close()
        *self.writer.lock().await = mpsc::channel(1).0;
    }

    /// Allocate a `join_ref` for a new topic and stash the handler.
    /// Returns the `join_ref` the caller passes to `push` for every
    /// frame on this topic.
    pub async fn register(&self, topic: &str, on_event: EventHandler) -> String {
        let jr = next_ref(&self.state);
        self.state.subs.lock().await.insert(
            topic.to_string(),
            Subscription {
                join_ref: jr.clone(),
                on_event,
                pending: HashMap::new(),
            },
        );
        jr
    }

    pub async fn unregister(&self, topic: &str) {
        self.state.subs.lock().await.remove(topic);
    }

    /// Send a frame and block until the matching phx_reply arrives or
    /// the caller-provided timeout elapses.
    pub async fn push(
        &self,
        topic: &str,
        event: &str,
        payload: Value,
        timeout: Duration,
    ) -> Result<Value, Error> {
        let r = next_ref(&self.state);
        let (rep_tx, rep_rx) = oneshot::channel();

        let join_ref = {
            let mut subs = self.state.subs.lock().await;
            if let Some(sub) = subs.get_mut(topic) {
                sub.pending.insert(r.clone(), rep_tx);
                sub.join_ref.clone()
            } else {
                // push to a topic we never registered — allowed but the
                // reply won't route back. Allocate a one-shot join_ref.
                drop(rep_tx);
                next_ref(&self.state)
            }
        };

        let frame = serde_json::json!([join_ref, r, topic, event, payload]).to_string();
        self.writer
            .lock()
            .await
            .send(frame)
            .await
            .map_err(|_| Error::new(ErrorKind::Transport("socket closed".into())))?;

        match tokio::time::timeout(timeout, rep_rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err(Error::new(ErrorKind::Transport(
                "reply channel dropped".into(),
            ))),
            Err(_) => {
                // drop pending entry
                if let Some(sub) = self.state.subs.lock().await.get_mut(topic) {
                    sub.pending.remove(&r);
                }
                Err(Error::new(ErrorKind::Timeout {
                    event: event.to_string(),
                    topic: topic.to_string(),
                }))
            }
        }
    }
}

async fn dispatch(state: &SocketState, frame: Vec<Value>) {
    let r = frame[1].as_str().map(|s| s.to_string());
    let topic = frame[2].as_str().unwrap_or("").to_string();
    let event = frame[3].as_str().unwrap_or("").to_string();
    let payload = frame[4].clone();

    // Heartbeat acks on the shared `phoenix` topic.
    if topic == "phoenix" {
        if let Some(ref r) = r {
            if let Some(tx) = state.heartbeat_pending.lock().await.remove(r) {
                let _ = tx.send(());
            }
        }
        return;
    }

    let mut subs = state.subs.lock().await;
    let Some(sub) = subs.get_mut(&topic) else {
        return;
    };

    if event == "phx_reply" {
        let Some(ref r) = r else {
            return;
        };
        let Some(rep_tx) = sub.pending.remove(r) else {
            return;
        };
        drop(subs);
        let status = payload.get("status").and_then(|s| s.as_str()).unwrap_or("");
        let response = payload
            .get("response")
            .cloned()
            .unwrap_or(Value::Object(Default::default()));
        if status == "ok" {
            let _ = rep_tx.send(Ok(response));
            return;
        }
        // error path
        let err_reply: ErrorReply =
            serde_json::from_value(response.clone()).unwrap_or(ErrorReply {
                reason: "unknown".into(),
                retry_after_ms: None,
            });
        let err = match err_reply.reason.as_str() {
            "unauthorized" | "unauthorized_read" | "unauthorized_write" => {
                Error::new(ErrorKind::Unauthorized)
            }
            "rate_limited" => Error::new(ErrorKind::RateLimited {
                retry_after_ms: err_reply.retry_after_ms.unwrap_or(0),
            }),
            other => {
                let payload = serde_json::from_value(response).unwrap_or_default();
                Error::new(ErrorKind::ServerError {
                    reason: other.to_string(),
                    payload,
                })
            }
        };
        let _ = rep_tx.send(Err(err));
        return;
    }

    let handler = sub.on_event.clone();
    drop(subs);
    handler(event, payload);
}

fn next_ref(state: &SocketState) -> String {
    state
        .ref_counter
        .fetch_add(1, Ordering::Relaxed)
        .to_string()
}

pub(crate) fn build_url(base: &str, params: &HashMap<String, String>) -> String {
    if params.is_empty() {
        return base.to_string();
    }
    let mut pairs: Vec<String> = params
        .iter()
        .map(|(k, v)| format!("{}={}", urlencode(k), urlencode(v)))
        .collect();
    pairs.sort(); // deterministic order for tests
    let sep = if base.contains('?') { '&' } else { '?' };
    format!("{}{}{}", base, sep, pairs.join("&"))
}

fn urlencode(s: &str) -> String {
    // Tiny URL encode — enough for our param values (base64/hex tokens).
    let mut out = String::with_capacity(s.len());
    for b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_url_no_params() {
        let params = HashMap::new();
        assert_eq!(
            build_url("ws://host/socket/websocket", &params),
            "ws://host/socket/websocket"
        );
    }

    #[test]
    fn build_url_with_params() {
        let mut p = HashMap::new();
        p.insert("vsn".into(), "2.0.0".into());
        p.insert("token".into(), "abc".into());
        let u = build_url("ws://host/socket/websocket", &p);
        assert!(u.contains("vsn=2.0.0"), "got {u}");
        assert!(u.contains("token=abc"), "got {u}");
        assert!(u.contains("?"), "got {u}");
    }

    #[test]
    fn build_url_appends_to_existing_query() {
        let mut p = HashMap::new();
        p.insert("vsn".into(), "2.0.0".into());
        let u = build_url("ws://host/ws?existing=1", &p);
        assert!(u.contains("?existing=1&vsn=2.0.0"), "got {u}");
    }

    #[test]
    fn urlencode_preserves_unreserved() {
        assert_eq!(urlencode("abcXYZ123-_.~"), "abcXYZ123-_.~");
    }

    #[test]
    fn urlencode_escapes_special() {
        assert_eq!(urlencode("a b"), "a%20b");
        assert_eq!(urlencode("a=b"), "a%3Db");
    }
}

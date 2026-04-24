//! A joined channel on the gateway. Create via [`Client::channel`];
//! no frames go on the wire until [`Channel::join`] is called.

use crate::errors::Error;
use crate::presence::Presence;
use crate::transport::{EventHandler, Socket};
use crate::types::{
    HistoryReply, HistoryRequest, JoinReply, JoinRequest, Message, PublishReply, PublishRequest,
};
use serde_json::Value;
use std::sync::{Arc, Mutex};
use std::time::Duration;

type MessageHandler = Box<dyn Fn(Message) + Send + Sync + 'static>;

/// Channel handle. One per (project, channel name).
pub struct Channel {
    socket: Arc<Socket>,
    topic: String,
    name: String,
    project_id: String,
    joined: Arc<Mutex<bool>>,
    handlers: Arc<Mutex<Vec<MessageHandler>>>,
    /// CRDT roster for this channel. Updated from `presence_state` and
    /// `presence_diff`. Register callbacks via [`Presence::on_sync`].
    pub presence: Arc<Presence>,
}

impl Channel {
    pub(crate) fn new(
        socket: Arc<Socket>,
        topic: String,
        name: String,
        project_id: String,
    ) -> Self {
        Self {
            socket,
            topic,
            name,
            project_id,
            joined: Arc::new(Mutex::new(false)),
            handlers: Arc::new(Mutex::new(Vec::new())),
            presence: Arc::new(Presence::new()),
        }
    }

    pub fn name(&self) -> &str {
        &self.name
    }

    pub fn project_id(&self) -> &str {
        &self.project_id
    }

    /// Send `phx_join` and await the reply. Seeds the client with the
    /// most recent 50 messages + region/node metadata. Call exactly
    /// once per channel instance.
    pub async fn join(&self, req: JoinRequest) -> Result<JoinReply, Error> {
        // Register before sending the join so the reply lands on our
        // pending-futures map.
        let handlers = self.handlers.clone();
        let presence = self.presence.clone();
        let cb: EventHandler = Arc::new(move |event, payload| match event.as_str() {
            "message" => {
                if let Ok(m) = serde_json::from_value::<Message>(payload) {
                    for h in handlers.lock().unwrap().iter() {
                        h(m.clone());
                    }
                }
            }
            "presence_state" => presence.set_state(&payload),
            "presence_diff" => presence.apply_diff(&payload),
            _ => {}
        });
        self.socket.register(&self.topic, cb).await;

        let payload = serde_json::to_value(&req)?;
        let raw = self
            .socket
            .push(&self.topic, "phx_join", payload, Duration::from_secs(10))
            .await?;
        let reply: JoinReply = serde_json::from_value(raw)?;
        *self.joined.lock().unwrap() = true;
        Ok(reply)
    }

    /// Send `phx_leave` and drop the subscription. Tolerant of an
    /// already-closing socket.
    pub async fn leave(&self) -> Result<(), Error> {
        let was_joined = {
            let mut j = self.joined.lock().unwrap();
            let was = *j;
            *j = false;
            was
        };
        if was_joined {
            let _ = self
                .socket
                .push(
                    &self.topic,
                    "phx_leave",
                    Value::Object(Default::default()),
                    Duration::from_secs(5),
                )
                .await;
        }
        self.socket.unregister(&self.topic).await;
        Ok(())
    }

    /// Publish one message. Returns [`ErrorKind::RateLimited`] if the
    /// project's per-second cap is hit, or [`ErrorKind::ServerError`]
    /// for anything else the server rejects.
    pub async fn publish(&self, req: PublishRequest) -> Result<PublishReply, Error> {
        let payload = serde_json::to_value(&req)?;
        let raw = self
            .socket
            .push(&self.topic, "publish", payload, Duration::from_secs(10))
            .await?;
        Ok(serde_json::from_value(raw)?)
    }

    /// Fetch a cursor-paginated page. Pages are oldest → newest; use
    /// the first message's id as `req.before` to walk backward.
    pub async fn history(&self, req: HistoryRequest) -> Result<HistoryReply, Error> {
        let payload = serde_json::to_value(&req)?;
        let raw = self
            .socket
            .push(&self.topic, "history", payload, Duration::from_secs(10))
            .await?;
        Ok(serde_json::from_value(raw)?)
    }

    /// Register a callback for incoming `message` events. Multiple
    /// handlers are supported; all fire for each message.
    pub fn on_message<F>(&self, handler: F)
    where
        F: Fn(Message) + Send + Sync + 'static,
    {
        self.handlers.lock().unwrap().push(Box::new(handler));
    }
}

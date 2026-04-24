//! Round-trip real wire payloads through the generated types. Drift
//! alarm for any future schema change.

use hela::{
    HistoryReply, HistorySource, JoinReply, Message, PublishReply, PublishRequest, Quota,
    TokenRequest,
};

const UUIDV7: &str = "01901234-abcd-7def-8123-456789abcdef";
const UUIDV7_OLDER: &str = "01801234-abcd-7def-8123-456789abcdef";

#[test]
fn message_roundtrip() {
    let payload = serde_json::json!({
        "id": UUIDV7,
        "channel": "chat:lobby",
        "author": "alice",
        "body": "hello",
        "node": "gw@iad-1",
        "inserted_at": "2026-04-24T01:00:00Z",
    });
    let m: Message = serde_json::from_value(payload).unwrap();
    assert_eq!(m.id, UUIDV7);
    assert_eq!(m.author, "alice");
    assert_eq!(m.body, "hello");
    assert!(m.reply_to_id.is_none());

    let encoded = serde_json::to_value(&m).unwrap();
    assert!(encoded.get("reply_to_id").is_none(), "omitempty failed");
    assert_eq!(encoded["id"], UUIDV7);
}

#[test]
fn message_with_reply_to_id() {
    let payload = serde_json::json!({
        "id": UUIDV7,
        "channel": "chat:lobby",
        "author": "alice",
        "body": "yep",
        "reply_to_id": UUIDV7_OLDER,
        "node": "gw@iad-1",
        "inserted_at": "2026-04-24T01:00:00Z",
    });
    let m: Message = serde_json::from_value(payload).unwrap();
    assert_eq!(m.reply_to_id.as_deref(), Some(UUIDV7_OLDER));
}

#[test]
fn message_rejects_missing_fields() {
    let payload = serde_json::json!({"id": UUIDV7, "body": "x"});
    assert!(serde_json::from_value::<Message>(payload).is_err());
}

#[test]
fn publish_request_omitempty() {
    let req = PublishRequest {
        body: "hi".into(),
        ..Default::default()
    };
    let out = serde_json::to_value(&req).unwrap();
    assert_eq!(out, serde_json::json!({"body": "hi"}));
}

#[test]
fn publish_reply_quota_enum() {
    let r: PublishReply =
        serde_json::from_value(serde_json::json!({"id": UUIDV7, "quota": "ok"})).unwrap();
    assert_eq!(r.quota, Quota::Ok);

    let r: PublishReply =
        serde_json::from_value(serde_json::json!({"id": UUIDV7, "quota": "over"})).unwrap();
    assert_eq!(r.quota, Quota::Over);

    assert!(serde_json::from_value::<PublishReply>(
        serde_json::json!({"id": UUIDV7, "quota": "bogus"})
    )
    .is_err());
}

#[test]
fn history_reply_all_sources() {
    for (src_str, src_enum) in [
        ("cache", HistorySource::Cache),
        ("mixed", HistorySource::Mixed),
        ("db", HistorySource::Db),
    ] {
        let hr: HistoryReply =
            serde_json::from_value(serde_json::json!({"source": src_str, "messages": []})).unwrap();
        assert_eq!(hr.source, src_enum);
        assert!(hr.messages.is_empty());
    }
}

#[test]
fn join_reply_full_shape() {
    let payload = serde_json::json!({
        "messages": [],
        "source": "cache",
        "region": "iad",
        "node": "gw@iad-1",
    });
    let r: JoinReply = serde_json::from_value(payload).unwrap();
    assert_eq!(r.region, "iad");
    assert_eq!(r.source, HistorySource::Cache);
}

#[test]
fn token_request_omitempty() {
    let req = TokenRequest {
        sub: "u1".into(),
        chans: None,
        ttl_seconds: None,
        ephemeral: false,
    };
    let out = serde_json::to_value(&req).unwrap();
    assert_eq!(out, serde_json::json!({"sub": "u1"}));
}

#[test]
fn inserted_at_parses_as_utc() {
    let payload = serde_json::json!({
        "id": UUIDV7,
        "channel": "c",
        "author": "a",
        "body": "b",
        "node": "n",
        "inserted_at": "2026-04-24T01:00:00Z",
    });
    let m: Message = serde_json::from_value(payload).unwrap();
    // chrono gives us DateTime<Utc>; no need to check tz, only the value
    assert_eq!(m.inserted_at.to_rfc3339(), "2026-04-24T01:00:00+00:00");
}

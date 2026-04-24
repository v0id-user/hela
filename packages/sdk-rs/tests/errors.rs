//! Error hierarchy: every public error kind, match-friendly.

use hela::{Error, ErrorKind};

#[test]
fn kind_is_exposed() {
    let e = Error::new(ErrorKind::Unauthorized);
    assert_eq!(*e.kind(), ErrorKind::Unauthorized);
}

#[test]
fn rate_limited_carries_retry_hint() {
    let e = Error::new(ErrorKind::RateLimited {
        retry_after_ms: 250,
    });
    match e.kind() {
        ErrorKind::RateLimited { retry_after_ms } => assert_eq!(*retry_after_ms, 250),
        other => panic!("expected RateLimited, got {other:?}"),
    }
    assert!(e.to_string().contains("250"));
}

#[test]
fn timeout_carries_context() {
    let e = Error::new(ErrorKind::Timeout {
        event: "publish".into(),
        topic: "chan:x:y".into(),
    });
    let s = e.to_string();
    assert!(s.contains("publish") && s.contains("chan:x:y"), "got {s}");
}

#[test]
fn server_error_exposes_reason() {
    let mut payload = std::collections::HashMap::new();
    payload.insert("retry_after_ms".into(), serde_json::json!(500));
    let e = Error::new(ErrorKind::ServerError {
        reason: "rate_limited".into(),
        payload,
    });
    match e.kind() {
        ErrorKind::ServerError { reason, payload } => {
            assert_eq!(reason, "rate_limited");
            assert_eq!(payload["retry_after_ms"], serde_json::json!(500));
        }
        other => panic!("expected ServerError, got {other:?}"),
    }
}

#[test]
fn into_kind_takes_ownership() {
    // Callers that want to destructure can do so without a clone.
    let e = Error::new(ErrorKind::Unauthorized);
    let kind = e.into_kind();
    assert_eq!(kind, ErrorKind::Unauthorized);
}

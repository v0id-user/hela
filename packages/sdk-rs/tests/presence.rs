//! CRDT state tests for hela::Presence. Mirrors phoenix.js' tests.

use hela::Presence;
use serde_json::json;
use std::sync::{Arc, Mutex};

#[test]
fn initial_empty() {
    let p = Presence::new();
    assert!(p.list().is_empty());
}

#[test]
fn set_state_populates() {
    let p = Presence::new();
    p.set_state(&json!({
        "alice": {"metas": [{"online_at": 1, "node": "n1", "phx_ref": "r1"}]},
        "bob":   {"metas": [{"online_at": 2, "node": "n1", "phx_ref": "r2"}]},
    }));
    let roster = p.list();
    assert_eq!(roster.len(), 2);
    assert_eq!(roster[0].id, "alice");
    assert_eq!(roster[1].id, "bob");
    assert_eq!(roster[0].metas[0].phx_ref.as_deref(), Some("r1"));
}

#[test]
fn diff_join_adds() {
    let p = Presence::new();
    p.set_state(&json!({
        "alice": {"metas": [{"online_at": 1, "node": "n1", "phx_ref": "r1"}]},
    }));
    p.apply_diff(&json!({
        "joins": {"bob": {"metas": [{"online_at": 2, "node": "n1", "phx_ref": "r2"}]}},
    }));
    let roster = p.list();
    assert_eq!(roster.len(), 2);
}

#[test]
fn diff_leave_removes() {
    let p = Presence::new();
    p.set_state(&json!({
        "alice": {"metas": [{"online_at": 1, "node": "n1", "phx_ref": "r1"}]},
        "bob":   {"metas": [{"online_at": 2, "node": "n1", "phx_ref": "r2"}]},
    }));
    p.apply_diff(&json!({
        "leaves": {"alice": {"metas": [{"online_at": 1, "node": "n1", "phx_ref": "r1"}]}},
    }));
    let roster = p.list();
    assert_eq!(roster.len(), 1);
    assert_eq!(roster[0].id, "bob");
}

#[test]
fn multi_connection_keeps_remaining_metas() {
    // Two tabs for alice; one disconnects; alice stays online.
    let p = Presence::new();
    p.set_state(&json!({
        "alice": {"metas": [
            {"online_at": 1, "node": "n1", "phx_ref": "tabA"},
            {"online_at": 2, "node": "n1", "phx_ref": "tabB"},
        ]},
    }));
    p.apply_diff(&json!({
        "leaves": {"alice": {"metas": [{"online_at": 1, "node": "n1", "phx_ref": "tabA"}]}},
    }));
    let roster = p.list();
    assert_eq!(roster.len(), 1);
    assert_eq!(roster[0].metas.len(), 1);
    assert_eq!(roster[0].metas[0].phx_ref.as_deref(), Some("tabB"));
}

#[test]
fn diff_leaves_before_joins() {
    let p = Presence::new();
    p.set_state(&json!({
        "alice": {"metas": [{"online_at": 1, "node": "n1", "phx_ref": "old"}]},
    }));
    p.apply_diff(&json!({
        "leaves": {"alice": {"metas": [{"online_at": 1, "node": "n1", "phx_ref": "old"}]}},
        "joins":  {"alice": {"metas": [{"online_at": 2, "node": "n1", "phx_ref": "new"}]}},
    }));
    let roster = p.list();
    assert_eq!(roster.len(), 1);
    assert_eq!(roster[0].metas.len(), 1);
    assert_eq!(roster[0].metas[0].phx_ref.as_deref(), Some("new"));
}

#[test]
fn leave_on_unknown_key_is_noop() {
    let p = Presence::new();
    p.apply_diff(&json!({
        "leaves": {"ghost": {"metas": [{"online_at": 1, "node": "n1", "phx_ref": "x"}]}},
    }));
    assert!(p.list().is_empty());
}

#[test]
fn on_sync_fires_on_register_and_updates() {
    let p = Presence::new();
    let calls: Arc<Mutex<Vec<Vec<String>>>> = Arc::new(Mutex::new(Vec::new()));
    let c = calls.clone();
    p.on_sync(move |entries| {
        c.lock()
            .unwrap()
            .push(entries.iter().map(|e| e.id.clone()).collect());
    });
    assert_eq!(calls.lock().unwrap().len(), 1);
    assert_eq!(calls.lock().unwrap()[0].len(), 0);

    p.set_state(&json!({
        "alice": {"metas": [{"online_at": 1, "node": "n1", "phx_ref": "r1"}]},
    }));
    let c = calls.lock().unwrap();
    assert_eq!(c.len(), 2);
    assert_eq!(c[1], vec!["alice".to_string()]);
}

#[test]
fn extras_preserved_on_meta() {
    let p = Presence::new();
    p.set_state(&json!({
        "alice": {"metas": [{
            "online_at": 1,
            "node": "n1",
            "phx_ref": "r1",
            "avatar_url": "https://x/y.png",
        }]},
    }));
    let roster = p.list();
    let m = &roster[0].metas[0];
    assert_eq!(
        m.extras.get("avatar_url").and_then(|v| v.as_str()),
        Some("https://x/y.png")
    );
    assert_eq!(m.node, "n1");
    assert_eq!(m.phx_ref.as_deref(), Some("r1"));
}

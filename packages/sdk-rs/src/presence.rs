//! CRDT-backed channel roster. Mirrors phoenix.js' Presence: the state
//! is authoritative, updated from `presence_state` (full) and
//! `presence_diff` (incremental) frames. Metas within a user merge by
//! `phx_ref` so duplicate connections behave right.

use crate::types::PresenceMeta;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// One entry in the roster: the user's id (nickname or JWT `sub`) and
/// a list of metas — one per live connection.
#[derive(Debug, Clone)]
pub struct PresenceEntry {
    pub id: String,
    pub metas: Vec<PresenceMeta>,
}

/// User-facing handler. Fires once at registration time with the
/// current snapshot, then on every subsequent state or diff.
pub type PresenceHandler = Box<dyn Fn(&[PresenceEntry]) + Send + Sync + 'static>;

/// CRDT roster. Each `Channel` owns one (shared via `Arc<Mutex<_>>`).
pub struct Presence {
    inner: Arc<Mutex<Inner>>,
}

impl Default for Presence {
    fn default() -> Self {
        Self::new()
    }
}

struct Inner {
    state: HashMap<String, Vec<PresenceMeta>>,
    handlers: Vec<PresenceHandler>,
}

impl Presence {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(Inner {
                state: HashMap::new(),
                handlers: Vec::new(),
            })),
        }
    }

    /// Register a sync callback. Fires once immediately with the
    /// current snapshot so subscribers don't have to wait for the
    /// next event.
    pub fn on_sync<F>(&self, handler: F)
    where
        F: Fn(&[PresenceEntry]) + Send + Sync + 'static,
    {
        let snapshot = {
            let mut inner = self.inner.lock().unwrap();
            let snap = snapshot_of(&inner.state);
            inner.handlers.push(Box::new(handler));
            snap
        };
        // fire the new handler with the current snapshot
        let handlers = self.inner.lock().unwrap();
        if let Some(h) = handlers.handlers.last() {
            h(&snapshot);
        }
    }

    /// Snapshot the roster, sorted by id for deterministic output.
    pub fn list(&self) -> Vec<PresenceEntry> {
        snapshot_of(&self.inner.lock().unwrap().state)
    }

    /// Replace the roster. Called by Channel when a `presence_state`
    /// frame arrives. Public so tests can drive it directly.
    pub fn set_state(&self, raw: &Value) {
        let new_state = decode_state(raw);
        let snapshot = {
            let mut inner = self.inner.lock().unwrap();
            inner.state = new_state;
            snapshot_of(&inner.state)
        };
        self.fire(&snapshot);
    }

    /// Merge a `presence_diff`. Leaves first, then joins — so a
    /// reconnect-with-flicker in one frame resolves to the new meta.
    pub fn apply_diff(&self, raw: &Value) {
        let leaves = raw
            .get("leaves")
            .and_then(|v| v.as_object())
            .cloned()
            .unwrap_or_default();
        let joins = raw
            .get("joins")
            .and_then(|v| v.as_object())
            .cloned()
            .unwrap_or_default();

        let snapshot = {
            let mut inner = self.inner.lock().unwrap();

            // leaves first
            for (key, entry) in &leaves {
                let Some(current) = inner.state.get(key).cloned() else {
                    continue;
                };
                let leaving_refs: Vec<String> = entry
                    .get("metas")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|m| {
                                m.get("phx_ref")
                                    .and_then(|r| r.as_str())
                                    .map(|s| s.to_string())
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                let remaining: Vec<PresenceMeta> = current
                    .into_iter()
                    .filter(|m| match &m.phx_ref {
                        Some(r) => !leaving_refs.iter().any(|lr| lr == r),
                        None => true,
                    })
                    .collect();
                if remaining.is_empty() {
                    inner.state.remove(key);
                } else {
                    inner.state.insert(key.clone(), remaining);
                }
            }

            // then joins
            for (key, entry) in &joins {
                let metas: Vec<PresenceMeta> = entry
                    .get("metas")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|m| serde_json::from_value(m.clone()).ok())
                            .collect()
                    })
                    .unwrap_or_default();
                let entry_vec = inner.state.entry(key.clone()).or_default();
                entry_vec.extend(metas);
            }

            snapshot_of(&inner.state)
        };
        self.fire(&snapshot);
    }

    fn fire(&self, snapshot: &[PresenceEntry]) {
        let inner = self.inner.lock().unwrap();
        for h in &inner.handlers {
            h(snapshot);
        }
    }
}

fn decode_state(raw: &Value) -> HashMap<String, Vec<PresenceMeta>> {
    let Some(obj) = raw.as_object() else {
        return HashMap::new();
    };
    let mut out = HashMap::with_capacity(obj.len());
    for (key, entry) in obj {
        let metas: Vec<PresenceMeta> = entry
            .get("metas")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| serde_json::from_value(m.clone()).ok())
                    .collect()
            })
            .unwrap_or_default();
        out.insert(key.clone(), metas);
    }
    out
}

fn snapshot_of(state: &HashMap<String, Vec<PresenceMeta>>) -> Vec<PresenceEntry> {
    let mut keys: Vec<&String> = state.keys().collect();
    keys.sort();
    keys.into_iter()
        .map(|k| PresenceEntry {
            id: k.clone(),
            metas: state[k].clone(),
        })
        .collect()
}

package hela

import (
	"encoding/json"
	"sort"
	"sync"
)

// Presence is the CRDT-backed channel roster. Mirrors phoenix.js'
// Presence: the state is authoritative, updated from presence_state
// (full) and presence_diff (incremental) frames. Metas within a user
// are merged by phx_ref so duplicate connections behave right.
//
// Presence is not constructed directly; each Channel exposes it at
// channel.Presence.
type Presence struct {
	mu       sync.Mutex
	state    map[string][]PresenceMeta
	handlers []PresenceHandler
}

// PresenceHandler receives the current roster on every state and diff.
// Registered via Presence.OnSync.
type PresenceHandler func([]PresenceEntry)

// NewPresence is exported so tests can drive Presence directly without
// spinning up a Channel. Normal code gets one via Channel.Presence.
func NewPresence() *Presence {
	return &Presence{state: map[string][]PresenceMeta{}}
}

// OnSync registers a handler. Fires once immediately (so subscribers
// don't wait for the next event), then on every subsequent set or
// diff.
func (p *Presence) OnSync(handler PresenceHandler) {
	p.mu.Lock()
	p.handlers = append(p.handlers, handler)
	p.mu.Unlock()
	// fire once with current snapshot
	handler(p.List())
}

// List returns a deterministic snapshot of the roster, sorted by id.
func (p *Presence) List() []PresenceEntry {
	p.mu.Lock()
	keys := make([]string, 0, len(p.state))
	for k := range p.state {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := make([]PresenceEntry, 0, len(keys))
	for _, k := range keys {
		metas := make([]PresenceMeta, len(p.state[k]))
		copy(metas, p.state[k])
		out = append(out, PresenceEntry{ID: k, Metas: metas})
	}
	p.mu.Unlock()
	return out
}

// SetState replaces the roster wholesale. Called by Channel when a
// presence_state frame arrives; exported so tests can drive it too.
func (p *Presence) SetState(raw json.RawMessage) {
	p.mu.Lock()
	p.state = decodeState(raw)
	handlers := append([]PresenceHandler(nil), p.handlers...)
	snapshot := p.snapshotLocked()
	p.mu.Unlock()
	for _, h := range handlers {
		h(snapshot)
	}
}

// ApplyDiff merges a presence_diff. Leaves applied before joins so a
// reconnect-with-flicker (same key leaving and rejoining in one
// frame) resolves to the new meta.
func (p *Presence) ApplyDiff(raw json.RawMessage) {
	var diff struct {
		Joins map[string]struct {
			Metas []json.RawMessage `json:"metas"`
		} `json:"joins"`
		Leaves map[string]struct {
			Metas []json.RawMessage `json:"metas"`
		} `json:"leaves"`
	}
	if err := json.Unmarshal(raw, &diff); err != nil {
		return
	}

	p.mu.Lock()
	// leaves first
	for key, entry := range diff.Leaves {
		current, ok := p.state[key]
		if !ok {
			continue
		}
		leavingRefs := make(map[string]struct{})
		for _, m := range entry.Metas {
			var pm PresenceMeta
			if decodeMeta(m, &pm) && pm.PhxRef != "" {
				leavingRefs[pm.PhxRef] = struct{}{}
			}
		}
		remaining := current[:0]
		for _, m := range current {
			if _, gone := leavingRefs[m.PhxRef]; !gone {
				remaining = append(remaining, m)
			}
		}
		if len(remaining) > 0 {
			p.state[key] = remaining
		} else {
			delete(p.state, key)
		}
	}
	// then joins
	for key, entry := range diff.Joins {
		metas := p.state[key]
		for _, m := range entry.Metas {
			var pm PresenceMeta
			if decodeMeta(m, &pm) {
				metas = append(metas, pm)
			}
		}
		p.state[key] = metas
	}
	handlers := append([]PresenceHandler(nil), p.handlers...)
	snapshot := p.snapshotLocked()
	p.mu.Unlock()
	for _, h := range handlers {
		h(snapshot)
	}
}

func (p *Presence) snapshotLocked() []PresenceEntry {
	keys := make([]string, 0, len(p.state))
	for k := range p.state {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := make([]PresenceEntry, 0, len(keys))
	for _, k := range keys {
		metas := make([]PresenceMeta, len(p.state[k]))
		copy(metas, p.state[k])
		out = append(out, PresenceEntry{ID: k, Metas: metas})
	}
	return out
}

// decodeState turns the raw presence_state JSON (a map of nick →
// {metas: [...]}) into the internal state map.
func decodeState(raw json.RawMessage) map[string][]PresenceMeta {
	var parsed map[string]struct {
		Metas []json.RawMessage `json:"metas"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return map[string][]PresenceMeta{}
	}
	out := make(map[string][]PresenceMeta, len(parsed))
	for k, v := range parsed {
		metas := make([]PresenceMeta, 0, len(v.Metas))
		for _, m := range v.Metas {
			var pm PresenceMeta
			if decodeMeta(m, &pm) {
				metas = append(metas, pm)
			}
		}
		out[k] = metas
	}
	return out
}

// decodeMeta decodes one meta into PresenceMeta, preserving any
// unknown fields in Extras.
func decodeMeta(raw json.RawMessage, out *PresenceMeta) bool {
	if err := json.Unmarshal(raw, out); err != nil {
		return false
	}
	// Grab extras: unmarshal into a map and remove the known keys.
	var all map[string]any
	if err := json.Unmarshal(raw, &all); err != nil {
		return true
	}
	for _, known := range []string{"online_at", "node", "region", "phx_ref"} {
		delete(all, known)
	}
	if len(all) > 0 {
		out.Extras = all
	}
	return true
}

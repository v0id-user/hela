package hela

import (
	"encoding/json"
	"testing"
)

// stateJSON is a tiny helper for building presence_state payloads.
func stateJSON(t *testing.T, state map[string][]map[string]any) json.RawMessage {
	t.Helper()
	out := map[string]any{}
	for nick, metas := range state {
		out[nick] = map[string]any{"metas": metas}
	}
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestPresenceEmpty(t *testing.T) {
	p := NewPresence()
	if got := p.List(); len(got) != 0 {
		t.Fatalf("new presence should be empty, got %d entries", len(got))
	}
}

func TestPresenceSetState(t *testing.T) {
	p := NewPresence()
	p.SetState(stateJSON(t, map[string][]map[string]any{
		"alice": {{"online_at": 1, "node": "n1", "phx_ref": "r1"}},
		"bob":   {{"online_at": 2, "node": "n1", "phx_ref": "r2"}},
	}))
	roster := p.List()
	if len(roster) != 2 || roster[0].ID != "alice" || roster[1].ID != "bob" {
		t.Fatalf("roster wrong: %+v", roster)
	}
	if roster[0].Metas[0].PhxRef != "r1" {
		t.Fatalf("phx_ref lost: %+v", roster[0].Metas)
	}
}

func TestPresenceDiffJoin(t *testing.T) {
	p := NewPresence()
	p.SetState(stateJSON(t, map[string][]map[string]any{
		"alice": {{"online_at": 1, "node": "n1", "phx_ref": "r1"}},
	}))
	diff := []byte(`{"joins":{"bob":{"metas":[{"online_at":2,"node":"n1","phx_ref":"r2"}]}}}`)
	p.ApplyDiff(diff)
	roster := p.List()
	if len(roster) != 2 {
		t.Fatalf("expected alice and bob, got %+v", roster)
	}
}

func TestPresenceDiffLeave(t *testing.T) {
	p := NewPresence()
	p.SetState(stateJSON(t, map[string][]map[string]any{
		"alice": {{"online_at": 1, "node": "n1", "phx_ref": "r1"}},
		"bob":   {{"online_at": 2, "node": "n1", "phx_ref": "r2"}},
	}))
	diff := []byte(`{"leaves":{"alice":{"metas":[{"online_at":1,"node":"n1","phx_ref":"r1"}]}}}`)
	p.ApplyDiff(diff)
	roster := p.List()
	if len(roster) != 1 || roster[0].ID != "bob" {
		t.Fatalf("expected only bob, got %+v", roster)
	}
}

func TestPresenceMultiConnectionLeavesOneBehind(t *testing.T) {
	// Two tabs for alice. One disconnects; alice stays online.
	p := NewPresence()
	p.SetState(stateJSON(t, map[string][]map[string]any{
		"alice": {
			{"online_at": 1, "node": "n1", "phx_ref": "tabA"},
			{"online_at": 2, "node": "n1", "phx_ref": "tabB"},
		},
	}))
	diff := []byte(`{"leaves":{"alice":{"metas":[{"online_at":1,"node":"n1","phx_ref":"tabA"}]}}}`)
	p.ApplyDiff(diff)
	roster := p.List()
	if len(roster) != 1 || len(roster[0].Metas) != 1 || roster[0].Metas[0].PhxRef != "tabB" {
		t.Fatalf("expected tabB to survive: %+v", roster)
	}
}

func TestPresenceDiffLeavesBeforeJoins(t *testing.T) {
	// Reconnect-with-flicker: same key leaves and rejoins in one frame,
	// the join must win.
	p := NewPresence()
	p.SetState(stateJSON(t, map[string][]map[string]any{
		"alice": {{"online_at": 1, "node": "n1", "phx_ref": "old"}},
	}))
	diff := []byte(`{
		"leaves":{"alice":{"metas":[{"online_at":1,"node":"n1","phx_ref":"old"}]}},
		"joins" :{"alice":{"metas":[{"online_at":2,"node":"n1","phx_ref":"new"}]}}
	}`)
	p.ApplyDiff(diff)
	roster := p.List()
	if len(roster) != 1 || len(roster[0].Metas) != 1 || roster[0].Metas[0].PhxRef != "new" {
		t.Fatalf("expected new phx_ref to win: %+v", roster)
	}
}

func TestPresenceLeaveOnUnknownKeyIsNoop(t *testing.T) {
	p := NewPresence()
	diff := []byte(`{"leaves":{"ghost":{"metas":[{"online_at":1,"node":"n1","phx_ref":"x"}]}}}`)
	p.ApplyDiff(diff) // must not panic
	if len(p.List()) != 0 {
		t.Fatalf("roster should stay empty")
	}
}

func TestPresenceOnSyncFiresOnRegisterAndOnUpdates(t *testing.T) {
	p := NewPresence()
	var calls [][]string
	p.OnSync(func(entries []PresenceEntry) {
		ids := make([]string, 0, len(entries))
		for _, e := range entries {
			ids = append(ids, e.ID)
		}
		calls = append(calls, ids)
	})
	// one fire from register
	if len(calls) != 1 || len(calls[0]) != 0 {
		t.Fatalf("expected one empty fire on register, got %+v", calls)
	}
	p.SetState(stateJSON(t, map[string][]map[string]any{
		"alice": {{"online_at": 1, "node": "n1", "phx_ref": "r1"}},
	}))
	if len(calls) != 2 || calls[1][0] != "alice" {
		t.Fatalf("expected second fire with alice, got %+v", calls)
	}
}

func TestPresenceMetaExtrasPreserved(t *testing.T) {
	p := NewPresence()
	p.SetState(stateJSON(t, map[string][]map[string]any{
		"alice": {{
			"online_at":  1,
			"node":       "n1",
			"phx_ref":    "r1",
			"avatar_url": "https://x/y.png",
		}},
	}))
	roster := p.List()
	m := roster[0].Metas[0]
	if m.Extras == nil || m.Extras["avatar_url"] != "https://x/y.png" {
		t.Fatalf("extras lost: %+v", m)
	}
	// core fields should still be populated, not pushed into Extras
	if m.Node != "n1" || m.PhxRef != "r1" {
		t.Fatalf("core fields lost: %+v", m)
	}
}

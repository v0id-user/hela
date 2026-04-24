package hela

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// UUIDv7 sample — structurally valid under the schema regex. First 48
// bits are a unix-ms, last chunk random.
const uuidv7 = "01901234-abcd-7def-8123-456789abcdef"

func TestMessageRoundtrip(t *testing.T) {
	payload := []byte(`{
		"id":"` + uuidv7 + `",
		"channel":"chat:lobby",
		"author":"alice",
		"body":"hello",
		"node":"gw@iad-1",
		"inserted_at":"2026-04-24T01:00:00Z"
	}`)
	var m Message
	if err := json.Unmarshal(payload, &m); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if m.ID != uuidv7 || m.Author != "alice" || m.Body != "hello" {
		t.Fatalf("round-trip mismatch: %+v", m)
	}
	if m.ReplyToID != "" {
		t.Fatalf("reply_to_id should be zero, got %q", m.ReplyToID)
	}
	if m.InsertedAt.Location() == nil || m.InsertedAt.Year() != 2026 {
		t.Fatalf("inserted_at bad: %v", m.InsertedAt)
	}

	// Re-encode; omitempty should drop the blank reply_to_id.
	out, err := json.Marshal(m)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	if strings.Contains(string(out), "reply_to_id") {
		t.Fatalf("reply_to_id leaked into encoded form: %s", out)
	}
}

func TestMessageWithReplyToID(t *testing.T) {
	payload := `{
		"id":"` + uuidv7 + `",
		"channel":"chat:lobby",
		"author":"alice",
		"body":"yep",
		"reply_to_id":"01801234-abcd-7def-8123-456789abcdef",
		"node":"gw@iad-1",
		"inserted_at":"2026-04-24T01:00:00Z"
	}`
	var m Message
	if err := json.Unmarshal([]byte(payload), &m); err != nil {
		t.Fatal(err)
	}
	if m.ReplyToID == "" {
		t.Fatalf("reply_to_id should be populated")
	}
}

func TestPublishRequestOmitempty(t *testing.T) {
	req := PublishRequest{Body: "hi"}
	out, _ := json.Marshal(req)
	// Author and reply_to_id should not appear when zero-valued.
	if strings.Contains(string(out), "author") || strings.Contains(string(out), "reply_to_id") {
		t.Fatalf("omitempty didn't fire: %s", out)
	}
}

func TestPublishReplyQuotaEnum(t *testing.T) {
	var r PublishReply
	_ = json.Unmarshal([]byte(`{"id":"`+uuidv7+`","quota":"ok"}`), &r)
	if r.Quota != QuotaOK {
		t.Fatalf("quota=ok did not roundtrip: got %q", r.Quota)
	}
	_ = json.Unmarshal([]byte(`{"id":"`+uuidv7+`","quota":"over"}`), &r)
	if r.Quota != QuotaOver {
		t.Fatalf("quota=over did not roundtrip: got %q", r.Quota)
	}
}

func TestHistoryReplyAllSources(t *testing.T) {
	for _, src := range []string{"cache", "mixed", "db"} {
		var h HistoryReply
		if err := json.Unmarshal([]byte(`{"source":"`+src+`","messages":[]}`), &h); err != nil {
			t.Fatal(err)
		}
		if string(h.Source) != src {
			t.Fatalf("source %q, got %q", src, h.Source)
		}
	}
}

func TestJoinReplyFullShape(t *testing.T) {
	payload := `{"messages":[],"source":"cache","region":"iad","node":"gw@iad-1"}`
	var r JoinReply
	if err := json.Unmarshal([]byte(payload), &r); err != nil {
		t.Fatal(err)
	}
	if r.Region != "iad" || r.Node != "gw@iad-1" {
		t.Fatalf("join reply: %+v", r)
	}
}

func TestInsertedAtIsUTC(t *testing.T) {
	// Gateway emits UTC with Z; Go parses it as time.Location *time.UTC.
	payload := `{
		"id":"` + uuidv7 + `",
		"channel":"c",
		"author":"a",
		"body":"b",
		"node":"n",
		"inserted_at":"2026-04-24T01:00:00Z"
	}`
	var m Message
	if err := json.Unmarshal([]byte(payload), &m); err != nil {
		t.Fatal(err)
	}
	if m.InsertedAt.Location() != time.UTC {
		t.Fatalf("expected UTC, got %v", m.InsertedAt.Location())
	}
}

func TestTokenRequestOmitempty(t *testing.T) {
	req := TokenRequest{Sub: "u1"}
	out, _ := json.Marshal(req)
	if strings.Contains(string(out), "chans") {
		t.Fatalf("empty chans leaked: %s", out)
	}
}

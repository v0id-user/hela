package hela

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

// These tests poke socket at its seams without a real WebSocket —
// push/dispatch are independent of the transport, so routing,
// reply correlation, and error mapping can be validated here.

func newTestSocket() *socket {
	// No ws set; we call register/dispatch directly instead of push.
	return newSocket("ws://test/socket/websocket", nil)
}

// --- register / unregister ----------------------------------------------

func TestSocketRegisterAllocatesUniqueJoinRefs(t *testing.T) {
	s := newTestSocket()
	ra := s.register("chan:a", func(string, json.RawMessage) {})
	rb := s.register("chan:b", func(string, json.RawMessage) {})
	if ra == rb {
		t.Fatalf("join_refs collided: %q == %q", ra, rb)
	}
	if _, ok := s.subs["chan:a"]; !ok {
		t.Fatalf("chan:a not registered")
	}
}

func TestSocketUnregisterDrops(t *testing.T) {
	s := newTestSocket()
	s.register("chan:a", func(string, json.RawMessage) {})
	s.unregister("chan:a")
	if _, ok := s.subs["chan:a"]; ok {
		t.Fatalf("chan:a still registered")
	}
}

func TestSocketUnregisterUnknownIsNoop(t *testing.T) {
	s := newTestSocket()
	// must not panic
	s.unregister("chan:ghost")
}

// --- dispatch routing ---------------------------------------------------

func TestDispatchRoutesOkReplyToPending(t *testing.T) {
	s := newTestSocket()
	s.register("chan:test", func(string, json.RawMessage) {})
	sub := s.subs["chan:test"]

	ch := make(chan pendingReply, 1)
	sub.pending["42"] = ch

	frame := []json.RawMessage{
		rawStr("1"), rawStr("42"), rawStr("chan:test"), rawStr("phx_reply"),
		json.RawMessage(`{"status":"ok","response":{"id":"abc"}}`),
	}
	s.dispatch(frame)

	select {
	case r := <-ch:
		if r.err != nil {
			t.Fatalf("unexpected error: %v", r.err)
		}
		if !strings.Contains(string(r.response), `"id":"abc"`) {
			t.Fatalf("wrong response: %s", r.response)
		}
	default:
		t.Fatalf("dispatch didn't deliver reply")
	}
}

func TestDispatchErrorReplyMapsUnauthorized(t *testing.T) {
	s := newTestSocket()
	s.register("chan:test", func(string, json.RawMessage) {})
	sub := s.subs["chan:test"]

	ch := make(chan pendingReply, 1)
	sub.pending["1"] = ch

	frame := []json.RawMessage{
		rawStr("1"), rawStr("1"), rawStr("chan:test"), rawStr("phx_reply"),
		json.RawMessage(`{"status":"error","response":{"reason":"unauthorized"}}`),
	}
	s.dispatch(frame)

	r := <-ch
	if r.err == nil {
		t.Fatalf("expected error")
	}
	var ue *UnauthorizedError
	if !errors.As(r.err, &ue) {
		t.Fatalf("expected UnauthorizedError, got %T", r.err)
	}
}

func TestDispatchErrorReplyMapsRateLimited(t *testing.T) {
	s := newTestSocket()
	s.register("chan:test", func(string, json.RawMessage) {})
	sub := s.subs["chan:test"]

	ch := make(chan pendingReply, 1)
	sub.pending["1"] = ch

	frame := []json.RawMessage{
		rawStr("1"), rawStr("1"), rawStr("chan:test"), rawStr("phx_reply"),
		json.RawMessage(`{"status":"error","response":{"reason":"rate_limited","retry_after_ms":250}}`),
	}
	s.dispatch(frame)

	r := <-ch
	var rl *RateLimitedError
	if !errors.As(r.err, &rl) {
		t.Fatalf("expected RateLimitedError, got %T", r.err)
	}
	if rl.RetryAfterMs != 250 {
		t.Fatalf("retry_after_ms: want 250, got %d", rl.RetryAfterMs)
	}
}

func TestDispatchErrorReplyFallsBackToServerError(t *testing.T) {
	s := newTestSocket()
	s.register("chan:test", func(string, json.RawMessage) {})
	sub := s.subs["chan:test"]

	ch := make(chan pendingReply, 1)
	sub.pending["1"] = ch

	frame := []json.RawMessage{
		rawStr("1"), rawStr("1"), rawStr("chan:test"), rawStr("phx_reply"),
		json.RawMessage(`{"status":"error","response":{"reason":"body_too_large"}}`),
	}
	s.dispatch(frame)

	r := <-ch
	var se *ServerError
	if !errors.As(r.err, &se) {
		t.Fatalf("expected ServerError, got %T", r.err)
	}
	if se.Reason != "body_too_large" {
		t.Fatalf("reason: want body_too_large, got %q", se.Reason)
	}
}

func TestDispatchCustomEventGoesToOnEvent(t *testing.T) {
	s := newTestSocket()
	seen := make(chan string, 1)
	s.register("chan:test", func(event string, payload json.RawMessage) {
		seen <- event + ":" + string(payload)
	})

	frame := []json.RawMessage{
		json.RawMessage("null"), json.RawMessage("null"),
		rawStr("chan:test"), rawStr("message"),
		json.RawMessage(`{"body":"hey"}`),
	}
	s.dispatch(frame)

	select {
	case got := <-seen:
		if got != `message:{"body":"hey"}` {
			t.Fatalf("unexpected: %s", got)
		}
	default:
		t.Fatalf("event not delivered")
	}
}

func TestDispatchOnUnknownTopicIsDropped(t *testing.T) {
	s := newTestSocket()
	// no subscription for chan:ghost — must not panic
	frame := []json.RawMessage{
		json.RawMessage("null"), json.RawMessage("null"),
		rawStr("chan:ghost"), rawStr("message"),
		json.RawMessage(`{"body":"x"}`),
	}
	s.dispatch(frame)
}

// --- URL composition ----------------------------------------------------

func TestSocketFullURLWithParams(t *testing.T) {
	s := newSocket("ws://host/socket/websocket", map[string]string{
		"vsn":   "2.0.0",
		"token": "abc",
	})
	u, err := s.fullURL()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(u, "vsn=2.0.0") || !strings.Contains(u, "token=abc") {
		t.Fatalf("params missing: %s", u)
	}
}

func TestSocketFullURLEmptyParams(t *testing.T) {
	s := newSocket("ws://host/socket/websocket", nil)
	u, _ := s.fullURL()
	if u != "ws://host/socket/websocket" {
		t.Fatalf("no-op expected: %s", u)
	}
}

func TestSocketFullURLAppendsToExistingQuery(t *testing.T) {
	s := newSocket("ws://host/ws?existing=1", map[string]string{"vsn": "2.0.0"})
	u, _ := s.fullURL()
	if !strings.Contains(u, "?existing=1&vsn=2.0.0") {
		t.Fatalf("expected append: %s", u)
	}
}

// --- helpers ------------------------------------------------------------

func rawStr(s string) json.RawMessage {
	b, _ := json.Marshal(s)
	return b
}

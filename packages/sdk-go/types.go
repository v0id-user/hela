// Package hela is the Go SDK for hela — managed real-time on BEAM.
//
// Import path:
//
//	import hela "github.com/v0id-user/hela/packages/sdk-go"
//
// Typical use:
//
//	ctx := context.Background()
//	client, err := hela.Connect(ctx, hela.Config{
//	    Region: "iad",
//	    Token:  jwt,
//	})
//	if err != nil { panic(err) }
//	defer client.Close()
//
//	chat := client.Channel("chat:lobby")
//	if _, err := chat.Join(ctx, hela.JoinRequest{Nickname: "alice"}); err != nil {
//	    panic(err)
//	}
//	chat.OnMessage(func(m hela.Message) { fmt.Println(m.Author, m.Body) })
//	_, _ = chat.Publish(ctx, hela.PublishRequest{Body: "hello"})
package hela

import "time"

// Every type below mirrors one schema in ../schemas/wire or a body
// shape in ../schemas/openapi.yaml. Field names use snake_case via
// `json` tags so the wire stays byte-for-byte identical to what
// Hela.Chat.Message.to_wire/1 emits on the gateway.
//
// Hand-written on purpose — the surface is small (11 types) and
// language-specific quirks (pointer-for-optional, time.Time for
// AwareDatetime) are easier to state here than to coerce out of a
// code generator. Round-trip tests in types_test.go validate real
// payloads against every struct.

// ----- WS: message --------------------------------------------------------

// Message is a single published message as it arrives on a
// subscriber. Canonical shape emitted by Hela.Chat.Message.to_wire/1.
type Message struct {
	// UUIDv7. First 48 bits are unix-ms; lexicographic order = chronological.
	ID         string    `json:"id"`
	Channel    string    `json:"channel"`
	Author     string    `json:"author"`
	Body       string    `json:"body"`
	ReplyToID  string    `json:"reply_to_id,omitempty"`
	Node       string    `json:"node"`
	InsertedAt time.Time `json:"inserted_at"`
}

// ----- WS: publish --------------------------------------------------------

// PublishRequest is the outgoing publish frame. Body capped at 4 KB
// server-side.
type PublishRequest struct {
	Body      string `json:"body"`
	Author    string `json:"author,omitempty"`
	ReplyToID string `json:"reply_to_id,omitempty"`
}

// Quota reports whether a published message was within the project's
// monthly cap. `over` means delivered and persisted, but metered for
// overage billing.
type Quota string

const (
	QuotaOK   Quota = "ok"
	QuotaOver Quota = "over"
)

// PublishReply is the server's reply to a publish event.
type PublishReply struct {
	ID    string `json:"id"`
	Quota Quota  `json:"quota"`
}

// ----- WS: history --------------------------------------------------------

// HistoryRequest is a cursor-paginated history query. `Before` is a
// message id from the previous page; omit for the most recent N.
type HistoryRequest struct {
	Before string `json:"before,omitempty"`
	Limit  int    `json:"limit,omitempty"`
}

// HistorySource reports where the page came from:
//   - `cache`: entirely from ETS hot-tier
//   - `mixed`: cache + Postgres topup
//   - `db`:    cache miss, Postgres fall-through
type HistorySource string

const (
	HistorySourceCache HistorySource = "cache"
	HistorySourceMixed HistorySource = "mixed"
	HistorySourceDB    HistorySource = "db"
)

// HistoryReply is ordered oldest → newest.
type HistoryReply struct {
	Source   HistorySource `json:"source"`
	Messages []Message     `json:"messages"`
}

// ----- WS: join -----------------------------------------------------------

// JoinRequest is the payload for `phx_join` on a
// chan:<project>:<channel> topic.
type JoinRequest struct {
	Nickname string `json:"nickname,omitempty"`
}

// JoinReply is the server's reply to phx_join. Seeds the client with
// the most recent 50 messages plus cluster metadata.
type JoinReply struct {
	Messages []Message     `json:"messages"`
	Source   HistorySource `json:"source"`
	Region   string        `json:"region"`
	Node     string        `json:"node"`
}

// ----- WS: presence ------------------------------------------------------

// PresenceMeta is one metadata record per live connection for a user.
// `PhxRef` is the Phoenix tracker ref that identifies this specific
// connection so the CRDT can merge duplicate users cleanly. Extra
// fields are preserved via Extras.
type PresenceMeta struct {
	OnlineAt int64  `json:"online_at"`
	Node     string `json:"node"`
	Region   string `json:"region,omitempty"`
	PhxRef   string `json:"phx_ref,omitempty"`

	// Extras holds any additional per-connection metadata the server
	// or other clients attached. Populated from the raw payload when
	// decoding, emitted back on encode. Custom app data lives here.
	Extras map[string]any `json:"-"`
}

// PresenceEntry is one user in the roster: their id (nickname) and a
// list of metas, one per live connection.
type PresenceEntry struct {
	ID    string
	Metas []PresenceMeta
}

// ----- WS: error reply ---------------------------------------------------

// ErrorReply is the generic shape for phx_reply error payloads.
// Known reasons: body_too_large, unauthorized_read, unauthorized_write,
// project_mismatch, rate_limited, bad_topic.
type ErrorReply struct {
	Reason       string `json:"reason"`
	RetryAfterMs int    `json:"retry_after_ms,omitempty"`
}

// ----- REST: tokens ------------------------------------------------------

// TokenRequest is the body for POST /v1/tokens.
type TokenRequest struct {
	Sub        string     `json:"sub"`
	Chans      [][]string `json:"chans,omitempty"`
	TTLSeconds int        `json:"ttl_seconds,omitempty"`
	Ephemeral  bool       `json:"ephemeral,omitempty"`
}

// TokenResponse carries the short-lived HS256 JWT.
type TokenResponse struct {
	Token     string `json:"token"`
	ExpiresIn int    `json:"expires_in"`
}

// ----- REST: publish / history --------------------------------------------

// PublishResponse is the REST equivalent of PublishReply — adds
// InsertedAt which is on the hot path but redundant on the WS reply
// (the id carries the same timestamp).
type PublishResponse struct {
	ID         string    `json:"id"`
	InsertedAt time.Time `json:"inserted_at"`
	Quota      Quota     `json:"quota"`
}

// HistoryResponse is the REST equivalent of HistoryReply, identical shape.
type HistoryResponse = HistoryReply

// ----- REST: playground ---------------------------------------------------

// PlaygroundTokenScope describes one grant on a playground token.
type PlaygroundTokenScope struct {
	Scope   string `json:"scope,omitempty"`
	Pattern string `json:"pattern,omitempty"`
}

// PlaygroundToken is the response from POST /playground/token.
type PlaygroundToken struct {
	Token     string                 `json:"token"`
	ProjectID string                 `json:"project_id"` // always "proj_public"
	ExpiresIn int                    `json:"expires_in"`
	Scopes    []PlaygroundTokenScope `json:"scopes"`
	Ephemeral bool                   `json:"ephemeral,omitempty"`
}

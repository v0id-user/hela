package hela

import (
	"errors"
	"fmt"
)

// SDK-level exception hierarchy. Everything raised from this package
// wraps Error so callers can type-switch or errors.Is against it for
// the whole surface in one clause:
//
//	if errors.Is(err, hela.Error) {
//	    // anything the SDK threw
//	}
//	var rl *hela.RateLimitedError
//	if errors.As(err, &rl) {
//	    time.Sleep(time.Duration(rl.RetryAfterMs) * time.Millisecond)
//	}

// ErrHela is the sentinel all hela errors wrap. Use errors.Is(err, ErrHela)
// to catch the whole SDK surface.
var ErrHela = errors.New("hela")

// UnauthorizedError is returned for 401 REST responses and for
// `{status: "error", response: {reason: "unauthorized"}}` WS replies.
type UnauthorizedError struct {
	Detail string
}

func (e *UnauthorizedError) Error() string {
	if e.Detail == "" {
		return "hela: unauthorized"
	}
	return "hela: unauthorized: " + e.Detail
}

func (e *UnauthorizedError) Unwrap() error { return ErrHela }

// RateLimitedError is returned when the per-second publish cap is hit.
// RetryAfterMs is the milliseconds until the current bucket resets;
// callers should back off that long before retrying.
type RateLimitedError struct {
	RetryAfterMs int
}

func (e *RateLimitedError) Error() string {
	return fmt.Sprintf("hela: rate limited (retry after %d ms)", e.RetryAfterMs)
}

func (e *RateLimitedError) Unwrap() error { return ErrHela }

// TimeoutError is returned when a Phoenix Channel push doesn't get a
// reply within the caller's timeout. Surfaced rather than hanging the
// caller forever.
type TimeoutError struct {
	Event string
	Topic string
}

func (e *TimeoutError) Error() string {
	return fmt.Sprintf("hela: %s on %s timed out", e.Event, e.Topic)
}

func (e *TimeoutError) Unwrap() error { return ErrHela }

// ServerError is the catch-all for phx_reply errors we don't map to a
// more specific type. Reason is the machine-readable code; Payload is
// the full error reply for debugging.
type ServerError struct {
	Reason  string
	Payload map[string]any
}

func (e *ServerError) Error() string {
	return "hela: server error: " + e.Reason
}

func (e *ServerError) Unwrap() error { return ErrHela }

package hela

import (
	"errors"
	"testing"
)

func TestEveryErrorWrapsHela(t *testing.T) {
	for _, err := range []error{
		&UnauthorizedError{},
		&RateLimitedError{RetryAfterMs: 100},
		&TimeoutError{Event: "publish", Topic: "chan:x:y"},
		&ServerError{Reason: "boom"},
	} {
		if !errors.Is(err, ErrHela) {
			t.Fatalf("%T does not wrap ErrHela", err)
		}
	}
}

func TestRateLimitedErrorCarriesRetryHint(t *testing.T) {
	e := &RateLimitedError{RetryAfterMs: 1234}
	if e.RetryAfterMs != 1234 {
		t.Fatalf("retry_after_ms dropped: %d", e.RetryAfterMs)
	}
	if !errorContains(e, "1234") {
		t.Fatalf("error message should mention retry ms: %q", e.Error())
	}
}

func TestServerErrorDefaultsEmptyPayload(t *testing.T) {
	e := &ServerError{Reason: "body_too_large"}
	if e.Payload != nil {
		// nil is fine, empty map is fine, non-empty would be weird
		if len(e.Payload) != 0 {
			t.Fatalf("payload should default to empty: %v", e.Payload)
		}
	}
}

func TestTypedErrorsViaErrorsAs(t *testing.T) {
	// Callers should use errors.As to peel out retry hints etc.
	var err error = &RateLimitedError{RetryAfterMs: 42}
	var rl *RateLimitedError
	if !errors.As(err, &rl) || rl.RetryAfterMs != 42 {
		t.Fatalf("errors.As failed")
	}
}

func errorContains(err error, substr string) bool {
	return err != nil && indexOf(err.Error(), substr) >= 0
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

package hela

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Test REST against a httptest server, not a live gateway. Covers the
// parts that don't need the whole stack: auth header wiring, 401
// mapping, 429 mapping, request body shape.

func TestRESTMintTokenSendsAuthHeader(t *testing.T) {
	var gotAuth string
	var gotBody TokenRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("authorization")
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.Header().Set("content-type", "application/json")
		_, _ = w.Write([]byte(`{"token":"eyJhbGc.x.y","expires_in":600}`))
	}))
	defer server.Close()

	client := NewREST(server.URL, RESTOptions{APIKey: "secret"})
	resp, err := client.MintToken(context.Background(), TokenRequest{
		Sub:        "user-1",
		Chans:      [][]string{{"read", "chat:*"}},
		TTLSeconds: 600,
	})
	if err != nil {
		t.Fatal(err)
	}
	if gotAuth != "Bearer secret" {
		t.Fatalf("auth header: %q", gotAuth)
	}
	if gotBody.Sub != "user-1" || gotBody.TTLSeconds != 600 {
		t.Fatalf("body not forwarded: %+v", gotBody)
	}
	if resp.Token == "" {
		t.Fatalf("token empty")
	}
}

func TestRESTMaps401ToUnauthorized(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "bad token", http.StatusUnauthorized)
	}))
	defer server.Close()

	client := NewREST(server.URL, RESTOptions{APIKey: "x"})
	_, err := client.MintToken(context.Background(), TokenRequest{Sub: "u"})
	var ue *UnauthorizedError
	if !errors.As(err, &ue) {
		t.Fatalf("expected UnauthorizedError, got %T: %v", err, err)
	}
	if !strings.Contains(ue.Detail, "bad token") {
		t.Fatalf("detail lost: %q", ue.Detail)
	}
}

func TestRESTMaps429ToRateLimited(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("content-type", "application/json")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"retry_after_ms":420}`))
	}))
	defer server.Close()

	client := NewREST(server.URL, RESTOptions{APIKey: "x"})
	_, err := client.Publish(context.Background(), "chat:lobby", PublishRequest{Body: "x"})
	var rl *RateLimitedError
	if !errors.As(err, &rl) {
		t.Fatalf("expected RateLimitedError, got %T: %v", err, err)
	}
	if rl.RetryAfterMs != 420 {
		t.Fatalf("retry_after_ms: %d", rl.RetryAfterMs)
	}
}

func TestRESTMaps429WithMalformedBody(t *testing.T) {
	// Server sends 429 but no JSON body — client should still return
	// RateLimitedError, just with a zero retry hint.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`<html>nope</html>`))
	}))
	defer server.Close()

	client := NewREST(server.URL, RESTOptions{APIKey: "x"})
	_, err := client.Publish(context.Background(), "chat:lobby", PublishRequest{Body: "x"})
	var rl *RateLimitedError
	if !errors.As(err, &rl) {
		t.Fatalf("expected RateLimitedError, got %T", err)
	}
	if rl.RetryAfterMs != 0 {
		t.Fatalf("expected zero retry hint, got %d", rl.RetryAfterMs)
	}
}

func TestRESTPlaygroundTokenSkipsAuthHeader(t *testing.T) {
	var gotAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("authorization")
		_, _ = w.Write([]byte(`{"token":"t","project_id":"proj_public","expires_in":300,"scopes":[]}`))
	}))
	defer server.Close()

	client := NewREST(server.URL, RESTOptions{})
	_, err := client.PlaygroundToken(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	if gotAuth != "" {
		t.Fatalf("playground token should not carry auth header, got %q", gotAuth)
	}
}

func TestRESTHistoryAppendsLimitAndBefore(t *testing.T) {
	var gotURL string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotURL = r.URL.String()
		_, _ = w.Write([]byte(`{"source":"cache","messages":[]}`))
	}))
	defer server.Close()

	client := NewREST(server.URL, RESTOptions{APIKey: "x"})
	_, err := client.History(context.Background(), "chat:lobby", HistoryRequest{
		Limit:  25,
		Before: uuidv7,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(gotURL, "limit=25") || !strings.Contains(gotURL, "before="+uuidv7) {
		t.Fatalf("query params missing: %q", gotURL)
	}
}

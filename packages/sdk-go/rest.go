package hela

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// REST is the server-side HTTP client. Use it to mint end-user JWTs
// from your backend, publish from a cron job, or fetch history
// out-of-band. One REST per base URL; safe for concurrent use.
//
// Bring your own http.Client if you want retries, metrics, or shared
// pooling:
//
//	rest := hela.NewREST("https://gateway-production-bfdf.up.railway.app", hela.RESTOptions{
//	    APIKey: os.Getenv("HELA_API_KEY"),
//	    HTTP:   myClient,
//	})
type REST struct {
	base   string
	apiKey string
	client *http.Client
}

// RESTOptions configures a REST instance.
type RESTOptions struct {
	APIKey string
	// HTTP lets callers plug in their own http.Client (retries, etc).
	// Optional; defaults to a 15-second-timeout stdlib client.
	HTTP *http.Client
}

// NewREST builds a client against the given base URL. Strip any
// trailing slash to keep JoinPath happy.
func NewREST(baseURL string, opts RESTOptions) *REST {
	client := opts.HTTP
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	return &REST{
		base:   strings.TrimRight(baseURL, "/"),
		apiKey: opts.APIKey,
		client: client,
	}
}

// MintToken asks the gateway to sign an HS256 JWT scoped to this
// project. Use it on the WebSocket `token` param.
func (r *REST) MintToken(ctx context.Context, req TokenRequest) (TokenResponse, error) {
	if req.TTLSeconds == 0 {
		req.TTLSeconds = 3600
	}
	var resp TokenResponse
	if err := r.post(ctx, "/v1/tokens", req, &resp, true); err != nil {
		return TokenResponse{}, err
	}
	return resp, nil
}

// PlaygroundToken issues a guest token for the public sandbox project.
// No API key required.
func (r *REST) PlaygroundToken(ctx context.Context, sub string) (PlaygroundToken, error) {
	body := map[string]any{}
	if sub != "" {
		body["sub"] = sub
	}
	var resp PlaygroundToken
	if err := r.post(ctx, "/playground/token", body, &resp, false); err != nil {
		return PlaygroundToken{}, err
	}
	return resp, nil
}

// Publish bypasses the WS entirely. Useful from cron jobs, background
// workers, or anywhere latency doesn't matter and you'd rather keep
// one fewer connection open.
func (r *REST) Publish(ctx context.Context, channel string, req PublishRequest) (PublishResponse, error) {
	var resp PublishResponse
	path := fmt.Sprintf("/v1/channels/%s/publish", url.PathEscape(channel))
	if err := r.post(ctx, path, req, &resp, true); err != nil {
		return PublishResponse{}, err
	}
	return resp, nil
}

// History fetches a cursor-paginated page via REST.
func (r *REST) History(ctx context.Context, channel string, req HistoryRequest) (HistoryReply, error) {
	if req.Limit == 0 {
		req.Limit = 50
	}
	params := url.Values{}
	params.Set("limit", strconv.Itoa(req.Limit))
	if req.Before != "" {
		params.Set("before", req.Before)
	}
	path := fmt.Sprintf("/v1/channels/%s/history?%s", url.PathEscape(channel), params.Encode())
	var resp HistoryReply
	if err := r.get(ctx, path, &resp); err != nil {
		return HistoryReply{}, err
	}
	return resp, nil
}

// --- internal HTTP ---------------------------------------------------

func (r *REST) post(ctx context.Context, path string, body, out any, auth bool) error {
	data, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("hela: marshal request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, "POST", r.base+path, bytes.NewReader(data))
	if err != nil {
		return err
	}
	r.addHeaders(req, auth)
	return r.do(req, out)
}

func (r *REST) get(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, "GET", r.base+path, nil)
	if err != nil {
		return err
	}
	r.addHeaders(req, true)
	return r.do(req, out)
}

func (r *REST) addHeaders(req *http.Request, auth bool) {
	req.Header.Set("content-type", "application/json")
	if auth && r.apiKey != "" {
		req.Header.Set("authorization", "Bearer "+r.apiKey)
	}
}

func (r *REST) do(req *http.Request, out any) error {
	resp, err := r.client.Do(req)
	if err != nil {
		return fmt.Errorf("hela: request: %w", err)
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case 401:
		data, _ := io.ReadAll(resp.Body)
		detail := string(data)
		if len(detail) > 200 {
			detail = detail[:200]
		}
		return &UnauthorizedError{Detail: detail}
	case 429:
		data, _ := io.ReadAll(resp.Body)
		retry := 0
		var parsed struct {
			RetryAfterMs int `json:"retry_after_ms"`
		}
		// Tolerate missing or malformed body — still return the right
		// typed error, just without the retry hint.
		_ = json.Unmarshal(data, &parsed)
		retry = parsed.RetryAfterMs
		return &RateLimitedError{RetryAfterMs: retry}
	}
	if resp.StatusCode >= 400 {
		data, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("hela: HTTP %d: %s: %w", resp.StatusCode, string(data), ErrHela)
	}
	if out == nil {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

package hela

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// Live-gateway integration. Mirrors scripts/e2e.py but exercises the
// Go SDK surface end-to-end. Skipped unless HELA_LIVE=1. Defaults
// point at the deployed Railway stack; override with HELA_GATEWAY
// and HELA_CONTROL env vars.
//
// Run with:
//
//	HELA_LIVE=1 go test -v -run Live ./...

func requireLive(t *testing.T) (gateway, control string) {
	t.Helper()
	if os.Getenv("HELA_LIVE") != "1" {
		t.Skip("set HELA_LIVE=1 to run live-gateway tests")
	}
	gateway = os.Getenv("HELA_GATEWAY")
	if gateway == "" {
		gateway = "https://gateway-production-bfdf.up.railway.app"
	}
	control = os.Getenv("HELA_CONTROL")
	if control == "" {
		control = "https://control-production-059e.up.railway.app"
	}
	return
}

type liveCreds struct {
	gateway, control string
	apiKey           string
	projectID        string
	userToken        string
}

// setupLive signs up a throwaway account, creates a project, issues
// an API key, and mints an end-user JWT. Session-scoped via
// sync.Once so the setup tax is paid once per test binary.
var (
	setupOnce   sync.Once
	setupCreds  *liveCreds
	setupErr    error
	setupCalled atomic.Bool
)

func setupLive(t *testing.T) *liveCreds {
	t.Helper()
	gateway, control := requireLive(t)
	setupCalled.Store(true)
	setupOnce.Do(func() {
		setupErr = doSetupLive(gateway, control)
	})
	if setupErr != nil {
		t.Fatalf("live setup failed: %v", setupErr)
	}
	return setupCreds
}

func doSetupLive(gateway, control string) error {
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Timeout: 20 * time.Second, Jar: jar}
	email := fmt.Sprintf("sdk-go-%d@gmail.com", time.Now().UnixMilli())

	// signup
	if _, err := post(c, control+"/auth/signup", map[string]any{"email": email}, nil); err != nil {
		return fmt.Errorf("signup: %w", err)
	}

	// create project
	var project struct {
		Project struct {
			ID string `json:"id"`
		} `json:"project"`
	}
	if _, err := post(c, control+"/api/projects", map[string]any{
		"name": "sdk-go-smoke", "region": "iad", "tier": "starter",
	}, &project); err != nil {
		return fmt.Errorf("create project: %w", err)
	}

	// api key
	var keyResp struct {
		Wire string `json:"wire"`
	}
	if _, err := post(c, control+"/api/projects/"+project.Project.ID+"/keys",
		map[string]any{"label": "sdk-go-smoke"}, &keyResp); err != nil {
		return fmt.Errorf("issue api key: %w", err)
	}

	// mint end-user token (retry a few times — control→gateway sync is
	// best-effort)
	var token string
	var lastErr error
	for i := 0; i < 5; i++ {
		rest := NewREST(gateway, RESTOptions{APIKey: keyResp.Wire})
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		resp, err := rest.MintToken(ctx, TokenRequest{
			Sub: "end-user-alice",
			Chans: [][]string{
				{"read", "chat:*"}, {"write", "chat:*"},
				{"read", "presence:*"}, {"write", "presence:*"},
			},
			TTLSeconds: 600,
		})
		cancel()
		if err == nil {
			token = resp.Token
			break
		}
		lastErr = err
		time.Sleep(1 * time.Second)
	}
	if token == "" {
		return fmt.Errorf("mint_token never succeeded: %w", lastErr)
	}

	setupCreds = &liveCreds{
		gateway:   gateway,
		control:   control,
		apiKey:    keyResp.Wire,
		projectID: project.Project.ID,
		userToken: token,
	}
	return nil
}

// post is a tiny JSON helper for the signup/project dance that goes
// through control, not the gateway (the gateway's REST SDK doesn't
// cover control-plane endpoints).
func post(c *http.Client, url string, body, out any) (*http.Response, error) {
	data, _ := json.Marshal(body)
	req, _ := http.NewRequest("POST", url, bytes.NewReader(data))
	req.Header.Set("content-type", "application/json")
	resp, err := c.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(b))
	}
	if out != nil {
		return resp, json.NewDecoder(resp.Body).Decode(out)
	}
	return resp, nil
}

// --- 1. connect + join --------------------------------------------------

func TestLiveConnectAndJoin(t *testing.T) {
	creds := setupLive(t)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	client, err := Connect(ctx, Config{
		Region:   RegionIAD,
		Token:    creds.userToken,
		Endpoint: creds.gateway,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()

	chat := client.Channel("chat:lobby")
	reply, err := chat.Join(ctx, JoinRequest{Nickname: "alice"})
	if err != nil {
		t.Fatal(err)
	}
	if reply.Region != "iad" {
		t.Fatalf("region: %q", reply.Region)
	}
}

// --- 2. publish + self-broadcast + typed Message -----------------------

func TestLivePublishAndReceive(t *testing.T) {
	creds := setupLive(t)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	client, err := Connect(ctx, Config{Region: RegionIAD, Token: creds.userToken, Endpoint: creds.gateway})
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()

	chat := client.Channel("chat:lobby")
	received := make(chan Message, 16)
	chat.OnMessage(func(m Message) { received <- m })

	if _, err := chat.Join(ctx, JoinRequest{Nickname: "alice"}); err != nil {
		t.Fatal(err)
	}
	pub, err := chat.Publish(ctx, PublishRequest{Body: "hello from sdk-go", Author: "alice"})
	if err != nil {
		t.Fatal(err)
	}

	deadline := time.After(3 * time.Second)
	for {
		select {
		case m := <-received:
			if m.ID == pub.ID {
				if m.Body != "hello from sdk-go" {
					t.Fatalf("body: %q", m.Body)
				}
				return
			}
		case <-deadline:
			t.Fatalf("never received self-broadcast")
		}
	}
}

// --- 3. rate-limit error is typed ---------------------------------------

func TestLiveRateLimitedIsTyped(t *testing.T) {
	creds := setupLive(t)
	// Burst through REST; the WS limiter uses the same bucket.
	rest := NewREST(creds.gateway, RESTOptions{APIKey: creds.apiKey})

	var (
		hit     int32
		retryMs int32
		workers = 60
		wg      sync.WaitGroup
	)
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			_, err := rest.Publish(ctx, "rl-test", PublishRequest{Body: "burst", Author: "bot"})
			var rl *RateLimitedError
			if errors.As(err, &rl) {
				atomic.AddInt32(&hit, 1)
				atomic.StoreInt32(&retryMs, int32(rl.RetryAfterMs))
			}
		}()
	}
	wg.Wait()

	if hit == 0 {
		t.Fatalf("rate limiter never tripped in %d-request burst", workers)
	}
}

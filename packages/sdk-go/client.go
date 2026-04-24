package hela

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
)

// Region is one of the hosted clusters, plus `dev` for localhost.
type Region string

const (
	RegionIAD Region = "iad" // Ashburn, US East
	RegionSJC Region = "sjc" // San Jose, US West
	RegionFRA Region = "fra" // Frankfurt, EU
	RegionSIN Region = "sin" // Singapore, Asia
	RegionSYD Region = "syd" // Sydney, AU
	RegionDEV Region = "dev" // localhost
)

var regions = map[Region]struct{ city, host string }{
	RegionIAD: {"Ashburn, US East", "iad.hela.dev"},
	RegionSJC: {"San Jose, US West", "sjc.hela.dev"},
	RegionFRA: {"Frankfurt, EU", "fra.hela.dev"},
	RegionSIN: {"Singapore, Asia", "sin.hela.dev"},
	RegionSYD: {"Sydney, AU", "syd.hela.dev"},
	RegionDEV: {"local dev", "localhost:4001"},
}

// Config is everything Connect needs to dial a gateway.
type Config struct {
	// Region picks the hosted cluster. Required.
	Region Region
	// Token is the customer JWT minted via /v1/tokens. Preferred for
	// user sessions.
	Token string
	// PlaygroundToken is the 5-minute guest token from /playground/token.
	// For landing-page demos.
	PlaygroundToken string
	// Endpoint overrides the computed host. Use with Region=dev for a
	// local gateway (e.g. "http://localhost:4001"). Optional.
	Endpoint string
}

// Client owns one WebSocket, multiplexing every channel over it.
type Client struct {
	cfg       Config
	sock      *socket
	projectID string
}

// Connect builds a Client, opens the socket, and returns. Pair with
// defer client.Close() — the reader + heartbeat goroutines are
// rooted in internal state and need explicit teardown.
func Connect(ctx context.Context, cfg Config) (*Client, error) {
	if _, ok := regions[cfg.Region]; !ok {
		return nil, fmt.Errorf("hela: unknown region %q: %w", cfg.Region, ErrHela)
	}
	params := map[string]string{"vsn": "2.0.0"}
	if cfg.Token != "" {
		params["token"] = cfg.Token
	}
	if cfg.PlaygroundToken != "" {
		params["playground"] = cfg.PlaygroundToken
	}

	c := &Client{
		cfg:       cfg,
		projectID: peekProjectID(firstNonEmpty(cfg.Token, cfg.PlaygroundToken)),
	}
	c.sock = newSocket(c.wsURL(), params)
	if err := c.sock.connect(ctx); err != nil {
		return nil, err
	}
	return c, nil
}

// Close tears down the socket and its goroutines.
func (c *Client) Close() error {
	if c.sock == nil {
		return nil
	}
	return c.sock.close()
}

// Channel creates a channel handle bound to this client. Doesn't send
// any frames until Join is called on the returned object.
func (c *Client) Channel(name string) *Channel {
	pid := c.projectID
	if pid == "" {
		pid = "proj_public"
	}
	return &Channel{
		socket:    c.sock,
		topic:     fmt.Sprintf("chan:%s:%s", pid, name),
		name:      name,
		projectID: pid,
		Presence:  NewPresence(),
	}
}

// Region returns the region this client was configured with.
func (c *Client) Region() Region { return c.cfg.Region }

// HTTPURL returns the REST base URL for this client's region.
func (c *Client) HTTPURL() string {
	if c.cfg.Endpoint != "" {
		return c.cfg.Endpoint
	}
	r := regions[c.cfg.Region]
	scheme := "https"
	if c.cfg.Region == RegionDEV {
		scheme = "http"
	}
	return fmt.Sprintf("%s://%s", scheme, r.host)
}

func (c *Client) wsURL() string {
	base := c.HTTPURL()
	if strings.HasPrefix(base, "https://") {
		base = "wss://" + strings.TrimPrefix(base, "https://")
	} else if strings.HasPrefix(base, "http://") {
		base = "ws://" + strings.TrimPrefix(base, "http://")
	}
	return base + "/socket/websocket"
}

// peekProjectID decodes a JWT without verifying — the server is the
// only verifier — and pulls the `pid` claim. Safe for HS256 and RS256
// tokens alike. Returns "" if the token is missing, malformed, or
// has no pid.
func peekProjectID(jwt string) string {
	if jwt == "" {
		return ""
	}
	parts := strings.SplitN(jwt, ".", 3)
	if len(parts) < 2 {
		return ""
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		// try with padding — some JWTs round-trip through standard b64
		payload, err = base64.URLEncoding.DecodeString(parts[1])
		if err != nil {
			return ""
		}
	}
	var claims struct {
		PID string `json:"pid"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return ""
	}
	return claims.PID
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

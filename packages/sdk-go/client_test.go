package hela

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"testing"
)

// --- peekProjectID -------------------------------------------------------

func mkJWT(t *testing.T, claims map[string]any) string {
	t.Helper()
	h, _ := json.Marshal(map[string]string{"alg": "HS256", "typ": "JWT"})
	c, _ := json.Marshal(claims)
	// raw (unpadded) base64url, same as phoenix.js + the Python SDK
	return b64(h) + "." + b64(c) + ".sig"
}

func b64(b []byte) string {
	return base64.RawURLEncoding.EncodeToString(b)
}

func TestPeekProjectIDHappyPath(t *testing.T) {
	jwt := mkJWT(t, map[string]any{"pid": "proj_abc123", "sub": "u1"})
	if got := peekProjectID(jwt); got != "proj_abc123" {
		t.Fatalf("expected proj_abc123, got %q", got)
	}
}

func TestPeekProjectIDMissingPID(t *testing.T) {
	jwt := mkJWT(t, map[string]any{"sub": "u1"})
	if got := peekProjectID(jwt); got != "" {
		t.Fatalf("expected empty, got %q", got)
	}
}

func TestPeekProjectIDEmpty(t *testing.T) {
	if got := peekProjectID(""); got != "" {
		t.Fatalf("expected empty, got %q", got)
	}
}

func TestPeekProjectIDMalformed(t *testing.T) {
	if got := peekProjectID("not.a.jwt"); got != "" {
		t.Fatalf("expected empty, got %q", got)
	}
	if got := peekProjectID("one-segment"); got != "" {
		t.Fatalf("expected empty, got %q", got)
	}
}

func TestPeekProjectIDNonStringPID(t *testing.T) {
	// pid must be a string — reject numeric claim values
	jwt := mkJWT(t, map[string]any{"pid": 12345})
	if got := peekProjectID(jwt); got != "" {
		t.Fatalf("expected empty for non-string pid, got %q", got)
	}
}

// --- URL composition -----------------------------------------------------

func TestHTTPURLForEachHostedRegion(t *testing.T) {
	for region, host := range map[Region]string{
		RegionIAD: "https://gateway-production-bfdf.up.railway.app",
		RegionSJC: "https://gateway-production-bfdf.up.railway.app",
		RegionAMS: "https://gateway-production-bfdf.up.railway.app",
		RegionSIN: "https://gateway-production-bfdf.up.railway.app",
		RegionSYD: "https://gateway-production-bfdf.up.railway.app",
	} {
		c := &Client{cfg: Config{Region: region}}
		if got := c.HTTPURL(); got != host {
			t.Errorf("region %s: want %s, got %s", region, host, got)
		}
	}
}

func TestHTTPURLDevUsesHTTP(t *testing.T) {
	c := &Client{cfg: Config{Region: RegionDEV}}
	if got := c.HTTPURL(); got != "http://localhost:4001" {
		t.Fatalf("dev url: %s", got)
	}
}

func TestHTTPURLCustomEndpointWins(t *testing.T) {
	c := &Client{cfg: Config{Region: RegionDEV, Endpoint: "http://127.0.0.1:9999"}}
	if got := c.HTTPURL(); got != "http://127.0.0.1:9999" {
		t.Fatalf("endpoint override: %s", got)
	}
}

func TestWSURL(t *testing.T) {
	c := &Client{cfg: Config{Region: RegionIAD}}
	if got := c.wsURL(); got != "wss://gateway-production-bfdf.up.railway.app/socket/websocket" {
		t.Fatalf("iad ws url: %s", got)
	}
	c = &Client{cfg: Config{Region: RegionDEV}}
	if got := c.wsURL(); got != "ws://localhost:4001/socket/websocket" {
		t.Fatalf("dev ws url: %s", got)
	}
}

// --- ConnectConfigValidation --------------------------------------------

func TestConnectRejectsUnknownRegion(t *testing.T) {
	_, err := Connect(testCtx(t), Config{Region: "nowhere"})
	if err == nil {
		t.Fatalf("expected error for bogus region")
	}
	if !errors.Is(err, ErrHela) {
		t.Fatalf("expected ErrHela wrap, got %v", err)
	}
}

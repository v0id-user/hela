package hela

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"sync"
	"time"

	"github.com/coder/websocket"
)

// socket is a Phoenix Channel v2 client. Not exported — Client wraps
// it with the domain API. One WebSocket, multiplexing many channels.
//
// Wire format, from phoenix.js source:
//
//	outgoing: [join_ref, ref, topic, event, payload]
//	incoming: [join_ref|null, ref|null, topic, event, payload]
//
// `ref` is client-chosen and monotonic per outbound frame; replies
// echo it back and that's how we pair pushes to responses. `join_ref`
// is the ref of the original phx_join for a topic; every subsequent
// frame on that topic reuses it so the server can tell multiple joins
// on the same topic apart.
type socket struct {
	url    string
	params map[string]string

	ws        *websocket.Conn
	heartbeat time.Duration
	mu        sync.Mutex

	refCounter int64
	subs       map[string]*subscription
	pendingHB  map[string]chan<- json.RawMessage

	ctx    context.Context
	cancel context.CancelFunc
	done   chan struct{}
}

type subscription struct {
	topic   string
	joinRef string
	onEvent func(event string, payload json.RawMessage)
	pending map[string]chan<- pendingReply
}

type pendingReply struct {
	response json.RawMessage
	err      error
}

type frame = [5]json.RawMessage

func newSocket(rawURL string, params map[string]string) *socket {
	return &socket{
		url:       rawURL,
		params:    params,
		heartbeat: 30 * time.Second,
		subs:      map[string]*subscription{},
		pendingHB: map[string]chan<- json.RawMessage{},
		done:      make(chan struct{}),
	}
}

// connect dials the gateway and starts the reader + heartbeat loops.
// Idempotent.
func (s *socket) connect(ctx context.Context) error {
	s.mu.Lock()
	if s.ws != nil {
		s.mu.Unlock()
		return nil
	}
	s.mu.Unlock()

	u, err := s.fullURL()
	if err != nil {
		return err
	}

	// Disable the library's own ping. Phoenix wants heartbeats on the
	// `phoenix` system topic, not WS control frames. We run our own.
	conn, _, err := websocket.Dial(ctx, u, &websocket.DialOptions{})
	if err != nil {
		return fmt.Errorf("hela: dial %s: %w", u, err)
	}
	// Accept up to 8 MB per message — safety cushion; our own body cap
	// is 4 KB.
	conn.SetReadLimit(8 << 20)

	s.mu.Lock()
	s.ws = conn
	s.ctx, s.cancel = context.WithCancel(context.Background())
	s.mu.Unlock()

	go s.reader()
	go s.heartbeatLoop()
	return nil
}

// close tears down the socket, reader, and heartbeat. Aborts every
// pending push with an informative error.
func (s *socket) close() error {
	s.mu.Lock()
	ws := s.ws
	cancel := s.cancel
	s.ws = nil
	s.mu.Unlock()

	if cancel != nil {
		cancel()
	}
	if ws != nil {
		_ = ws.Close(websocket.StatusNormalClosure, "client close")
	}

	s.mu.Lock()
	for _, sub := range s.subs {
		for _, ch := range sub.pending {
			ch <- pendingReply{err: fmt.Errorf("hela: socket closed: %w", ErrHela)}
		}
		sub.pending = map[string]chan<- pendingReply{}
	}
	s.mu.Unlock()
	return nil
}

// register allocates a join_ref for a new topic and stashes the event
// handler. Callers push phx_join after this so the reply routes to
// the pending-futures map.
func (s *socket) register(topic string, onEvent func(event string, payload json.RawMessage)) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	jr := s.nextRef()
	s.subs[topic] = &subscription{
		topic:   topic,
		joinRef: jr,
		onEvent: onEvent,
		pending: map[string]chan<- pendingReply{},
	}
	return jr
}

func (s *socket) unregister(topic string) {
	s.mu.Lock()
	delete(s.subs, topic)
	s.mu.Unlock()
}

// push sends a frame and blocks until the matching phx_reply arrives
// or the context deadlines. Returns the decoded response payload for
// status=ok, a *ServerError / *UnauthorizedError for status=error, and
// a *TimeoutError if the context fires first.
func (s *socket) push(ctx context.Context, topic, event string, payload any) (json.RawMessage, error) {
	s.mu.Lock()
	ws := s.ws
	s.mu.Unlock()
	if ws == nil {
		return nil, fmt.Errorf("hela: push before connect: %w", ErrHela)
	}

	s.mu.Lock()
	sub := s.subs[topic]
	var joinRef string
	if sub != nil {
		joinRef = sub.joinRef
	} else {
		joinRef = s.nextRef()
	}
	ref := s.nextRef()

	replyCh := make(chan pendingReply, 1)
	if sub != nil {
		sub.pending[ref] = replyCh
	}
	s.mu.Unlock()

	// Clean up the pending entry regardless of outcome.
	defer func() {
		s.mu.Lock()
		if sub != nil {
			delete(sub.pending, ref)
		}
		s.mu.Unlock()
	}()

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("hela: marshal payload: %w", err)
	}
	joinRefJSON, _ := json.Marshal(joinRef)
	refJSON, _ := json.Marshal(ref)
	topicJSON, _ := json.Marshal(topic)
	eventJSON, _ := json.Marshal(event)

	frameBytes, err := json.Marshal([]json.RawMessage{
		joinRefJSON, refJSON, topicJSON, eventJSON, payloadBytes,
	})
	if err != nil {
		return nil, fmt.Errorf("hela: marshal frame: %w", err)
	}

	if err := ws.Write(ctx, websocket.MessageText, frameBytes); err != nil {
		return nil, fmt.Errorf("hela: send frame: %w", err)
	}

	select {
	case rep := <-replyCh:
		return rep.response, rep.err
	case <-ctx.Done():
		return nil, &TimeoutError{Event: event, Topic: topic}
	}
}

func (s *socket) reader() {
	defer close(s.done)
	for {
		s.mu.Lock()
		ws := s.ws
		ctx := s.ctx
		s.mu.Unlock()
		if ws == nil || ctx == nil {
			return
		}

		_, data, err := ws.Read(ctx)
		if err != nil {
			return
		}
		var raw []json.RawMessage
		if err := json.Unmarshal(data, &raw); err != nil || len(raw) != 5 {
			continue
		}
		s.dispatch(raw)
	}
}

// dispatch routes an incoming frame. Frame shape:
//
//	[join_ref, ref, topic, event, payload]
func (s *socket) dispatch(raw []json.RawMessage) {
	var ref string
	var topic string
	var event string
	// join_ref is discarded — we track it per-subscription ourselves.
	_ = json.Unmarshal(raw[1], &ref)
	_ = json.Unmarshal(raw[2], &topic)
	_ = json.Unmarshal(raw[3], &event)
	payload := raw[4]

	// Heartbeat replies land on the shared "phoenix" topic.
	if topic == "phoenix" && ref != "" {
		s.mu.Lock()
		ch, ok := s.pendingHB[ref]
		if ok {
			delete(s.pendingHB, ref)
		}
		s.mu.Unlock()
		if ok {
			ch <- payload
		}
		return
	}

	s.mu.Lock()
	sub, ok := s.subs[topic]
	s.mu.Unlock()
	if !ok {
		return
	}

	if event == "phx_reply" && ref != "" {
		s.mu.Lock()
		replyCh, found := sub.pending[ref]
		if found {
			delete(sub.pending, ref)
		}
		s.mu.Unlock()
		if !found {
			return
		}
		var reply struct {
			Status   string          `json:"status"`
			Response json.RawMessage `json:"response"`
		}
		if err := json.Unmarshal(payload, &reply); err != nil {
			replyCh <- pendingReply{err: fmt.Errorf("hela: bad reply payload: %w", err)}
			return
		}
		if reply.Status == "ok" {
			replyCh <- pendingReply{response: reply.Response}
			return
		}
		// Error path — extract reason + known codes.
		var errReply ErrorReply
		_ = json.Unmarshal(reply.Response, &errReply)
		var fullPayload map[string]any
		_ = json.Unmarshal(reply.Response, &fullPayload)
		switch errReply.Reason {
		case "unauthorized", "unauthorized_read", "unauthorized_write":
			replyCh <- pendingReply{err: &UnauthorizedError{Detail: errReply.Reason}}
		case "rate_limited":
			replyCh <- pendingReply{err: &RateLimitedError{RetryAfterMs: errReply.RetryAfterMs}}
		default:
			reason := errReply.Reason
			if reason == "" {
				reason = "unknown"
			}
			replyCh <- pendingReply{err: &ServerError{Reason: reason, Payload: fullPayload}}
		}
		return
	}

	if sub.onEvent != nil {
		sub.onEvent(event, payload)
	}
}

func (s *socket) heartbeatLoop() {
	ticker := time.NewTicker(s.heartbeat)
	defer ticker.Stop()
	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
		}

		s.mu.Lock()
		ws := s.ws
		s.mu.Unlock()
		if ws == nil {
			return
		}

		ref := s.nextRef()
		replyCh := make(chan json.RawMessage, 1)
		s.mu.Lock()
		s.pendingHB[ref] = replyCh
		s.mu.Unlock()

		refJSON, _ := json.Marshal(ref)
		frameBytes, _ := json.Marshal([]json.RawMessage{
			json.RawMessage("null"),
			refJSON,
			json.RawMessage(`"phoenix"`),
			json.RawMessage(`"heartbeat"`),
			json.RawMessage("{}"),
		})
		sendCtx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
		if err := ws.Write(sendCtx, websocket.MessageText, frameBytes); err != nil {
			cancel()
			return
		}
		cancel()

		// Wait up to 10s for ack; if nothing comes, the connection is
		// dead and the reader goroutine will notice too.
		waitCtx, waitCancel := context.WithTimeout(s.ctx, 10*time.Second)
		select {
		case <-replyCh:
		case <-waitCtx.Done():
			s.mu.Lock()
			delete(s.pendingHB, ref)
			s.mu.Unlock()
		}
		waitCancel()
	}
}

func (s *socket) nextRef() string {
	s.refCounter++
	return strconv.FormatInt(s.refCounter, 10)
}

func (s *socket) fullURL() (string, error) {
	if len(s.params) == 0 {
		return s.url, nil
	}
	q := url.Values{}
	for k, v := range s.params {
		q.Set(k, v)
	}
	if contains(s.url, "?") {
		return s.url + "&" + q.Encode(), nil
	}
	return s.url + "?" + q.Encode(), nil
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

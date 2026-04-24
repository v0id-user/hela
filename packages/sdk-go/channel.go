package hela

import (
	"context"
	"encoding/json"
	"sync"
)

// Channel is a joined topic on the gateway. Create via
// Client.Channel(name); calls don't go on the wire until you call
// Join. Thread-safe.
type Channel struct {
	socket    *socket
	topic     string
	name      string
	projectID string

	mu       sync.Mutex
	joined   bool
	handlers []func(Message)
	Presence *Presence
}

// Name returns the logical channel name, without the project prefix.
func (c *Channel) Name() string { return c.name }

// ProjectID returns the project id the channel lives in.
func (c *Channel) ProjectID() string { return c.projectID }

// Join sends phx_join and awaits the reply. Seeds the client with the
// most recent 50 messages + region/node metadata. Call exactly once
// per channel instance.
func (c *Channel) Join(ctx context.Context, req JoinRequest) (JoinReply, error) {
	// Register the subscription BEFORE sending the join so the join's
	// reply lands on our pending-futures map.
	c.socket.register(c.topic, c.onEvent)

	raw, err := c.socket.push(ctx, c.topic, "phx_join", req)
	if err != nil {
		c.socket.unregister(c.topic)
		return JoinReply{}, err
	}
	var reply JoinReply
	if err := json.Unmarshal(raw, &reply); err != nil {
		return JoinReply{}, err
	}
	c.mu.Lock()
	c.joined = true
	c.mu.Unlock()
	return reply, nil
}

// Leave sends phx_leave and drops the subscription. Tolerant of an
// already-closing socket.
func (c *Channel) Leave(ctx context.Context) error {
	c.mu.Lock()
	joined := c.joined
	c.joined = false
	c.mu.Unlock()
	if joined {
		_, _ = c.socket.push(ctx, c.topic, "phx_leave", map[string]any{})
	}
	c.socket.unregister(c.topic)
	return nil
}

// Publish sends a message on this channel. Returns RateLimitedError
// if the project's per-second cap is hit, or ServerError for anything
// else the server rejects.
func (c *Channel) Publish(ctx context.Context, req PublishRequest) (PublishReply, error) {
	raw, err := c.socket.push(ctx, c.topic, "publish", req)
	if err != nil {
		return PublishReply{}, err
	}
	var reply PublishReply
	if err := json.Unmarshal(raw, &reply); err != nil {
		return PublishReply{}, err
	}
	return reply, nil
}

// History fetches a cursor-paginated page. Pages are oldest → newest;
// use the first message's id as req.Before to walk backward.
func (c *Channel) History(ctx context.Context, req HistoryRequest) (HistoryReply, error) {
	if req.Limit == 0 {
		req.Limit = 50
	}
	raw, err := c.socket.push(ctx, c.topic, "history", req)
	if err != nil {
		return HistoryReply{}, err
	}
	var reply HistoryReply
	if err := json.Unmarshal(raw, &reply); err != nil {
		return HistoryReply{}, err
	}
	return reply, nil
}

// OnMessage registers a callback for incoming message events. Safe
// to call multiple times; all handlers fire for each message.
func (c *Channel) OnMessage(handler func(Message)) {
	c.mu.Lock()
	c.handlers = append(c.handlers, handler)
	c.mu.Unlock()
}

// onEvent is the callback the socket hands to register. Routes each
// kind of server-initiated frame to the right place.
func (c *Channel) onEvent(event string, payload json.RawMessage) {
	switch event {
	case "message":
		var m Message
		if err := json.Unmarshal(payload, &m); err != nil {
			// malformed payload — log would be nice but we don't own
			// logging in the SDK; swallow so one bad frame can't
			// crash the reader goroutine
			return
		}
		c.mu.Lock()
		handlers := make([]func(Message), len(c.handlers))
		copy(handlers, c.handlers)
		c.mu.Unlock()
		for _, h := range handlers {
			h(m)
		}
	case "presence_state":
		c.Presence.SetState(payload)
	case "presence_diff":
		c.Presence.ApplyDiff(payload)
	}
}

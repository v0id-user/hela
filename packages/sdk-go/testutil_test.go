package hela

import (
	"context"
	"testing"
	"time"
)

// testCtx returns a context that auto-cancels after 2 seconds — enough
// for unit tests to finish deterministically but short enough that a
// forgotten blocking call doesn't hang the suite.
func testCtx(t *testing.T) context.Context {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	t.Cleanup(cancel)
	return ctx
}

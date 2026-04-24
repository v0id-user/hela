#!/bin/sh
# Enforces the commit-message rules for the hela repo:
#
#   - ASCII only
#   - Letters, digits, spaces, and commas only
#   - 4 to 72 chars
#
# Used by .git/hooks/commit-msg locally and by .github/workflows/pr-lint.yml
# in CI. Pass the subject line as the only argument.
#
# Exit 0 → ok. Exit 1 → rejected (with a human-readable reason on stderr).

set -e

subject="$1"

if [ -z "$subject" ]; then
  echo "err: empty commit subject" >&2
  exit 1
fi

len=$(printf '%s' "$subject" | wc -c | tr -d ' ')

if [ "$len" -lt 4 ]; then
  echo "err: subject too short ($len chars) — need at least 4" >&2
  exit 1
fi

if [ "$len" -gt 72 ]; then
  echo "err: subject too long ($len chars) — keep it at 72 or fewer" >&2
  exit 1
fi

# Whitelist: A-Z a-z 0-9 space comma. Anything else is rejected.
case "$subject" in
  *[!A-Za-z0-9\ ,]*)
    echo "err: subject contains disallowed characters" >&2
    echo "  allowed: letters, digits, spaces, commas" >&2
    echo "  subject: $subject" >&2
    exit 1
    ;;
esac

exit 0

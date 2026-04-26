#!/bin/sh
# Enforces the commit-message rules for the hela repo:
#
#   - ASCII only
#   - Letters, digits, spaces, commas, colons, parens, hashes
#   - Human content 4 to 72 chars (excluding any trailing ` (#NNN)`
#     PR-number suffix that GitHub's squash-merge appends)
#
# Colons are allowed so Conventional-Commits-style prefixes work:
#
#     fix: race in cache trim
#     feat: per project signing secret (#42)
#
# Parens and hash signs are allowed because GitHub's squash-merge
# button appends ` (#NNN)` to every merged subject. Hyphens, dots,
# underscores and other punctuation are still rejected. Bot PRs
# (Dependabot etc) are exempted in the CI lint, not this script.
#
# Length is measured on the body — the subject line MINUS the
# trailing PR-number ref. A 70-char subject + ` (#42)` is fine; the
# auto-appended suffix is not part of the human-budget.
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

# Strip an optional trailing ` (#NNNN)` PR-number reference for the
# length check below. The whitelist still runs on the full subject so
# parens and hash are only acceptable in the suffix shape.
case "$subject" in
  *' (#'*[0-9]')')
    body=${subject% (#*\)}
    ;;
  *)
    body=$subject
    ;;
esac

len=$(printf '%s' "$body" | wc -c | tr -d ' ')

if [ "$len" -lt 4 ]; then
  echo "err: subject too short ($len chars) — need at least 4" >&2
  exit 1
fi

if [ "$len" -gt 72 ]; then
  echo "err: subject too long ($len chars excluding any trailing PR ref) — keep it at 72 or fewer" >&2
  exit 1
fi

# Whitelist: A-Z a-z 0-9 space comma colon paren hash. Anything else
# is rejected.
case "$subject" in
  *[!A-Za-z0-9\ ,:#\(\)]*)
    echo "err: subject contains disallowed characters" >&2
    echo "  allowed: letters, digits, spaces, commas, colons, parens, hashes" >&2
    echo "  subject: $subject" >&2
    exit 1
    ;;
esac

exit 0

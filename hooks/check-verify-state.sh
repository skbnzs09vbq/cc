#!/usr/bin/env bash
# Shared check used by both the git pre-commit hook and the Claude Code
# PreToolUse hook. Must be run with cwd = the .claude repo root.
# Exit 0: project.example.ts / CLAUDE.md / agents / skills content matches
#         the last verify-no-project-leak run (safe to commit).
# Exit 1: unverified or changed since last verification (should block).
set -euo pipefail

STATE_PATH="local/verify-state.json"
TARGETS="project.example.ts CLAUDE.md agents skills"

current=$(git ls-files -z --cached --others --exclude-standard $TARGETS | sort -z | xargs -0 cat 2>/dev/null | sha256sum | awk '{print $1}')
verified=""
if [ -f "$STATE_PATH" ]; then
  verified=$(grep -o '"verifiedChecksum"[[:space:]]*:[[:space:]]*"[^"]*"' "$STATE_PATH" \
    | sed -E 's/.*"([0-9a-f]+)"$/\1/')
fi

if [ -n "$current" ] && [ "$current" = "$verified" ]; then
  exit 0
fi

echo "project.example.ts / CLAUDE.md / agents / skills が前回検証時から変更されている（または未検証な）ため、コミットをブロックします。"
echo "verify-no-project-leak スキルを実行し、project固有の実値・秘密情報が無いことを確認してから再度コミットしてください。"
exit 1

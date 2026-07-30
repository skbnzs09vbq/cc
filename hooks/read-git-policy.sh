#!/usr/bin/env bash
# Echoes the .claude git policy mode ("normal" | "no-commit"). Must be run
# with cwd = the .claude repo root. Defaults to "normal" when unset, since
# that's the setup skill's default choice.
POLICY_PATH="local/git-policy.json"
mode="normal"
if [ -f "$POLICY_PATH" ]; then
  found=$(grep -o '"mode"[[:space:]]*:[[:space:]]*"[^"]*"' "$POLICY_PATH" | sed -E 's/.*"([a-z-]+)"$/\1/')
  [ -n "$found" ] && mode="$found"
fi
echo "$mode"

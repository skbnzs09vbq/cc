#!/usr/bin/env bash
# Claude Code PreToolUse hook (matcher: Bash). Reads the tool-call payload
# from stdin, and if it's a `git commit` invocation happening inside the
# .claude (cc.git) repo itself, blocks it (exit 2) unless verify-state is
# up to date, so Claude runs the verify-project-info skill first.
# Commits elsewhere (e.g. a product-repo worktree) are left untouched.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

command=$(node -e "
  let d = '';
  process.stdin.on('data', (c) => (d += c));
  process.stdin.on('end', () => {
    try {
      const j = JSON.parse(d);
      process.stdout.write(String((j.tool_input && j.tool_input.command) || ''));
    } catch (e) {}
  });
")

if ! echo "$command" | grep -qE '(^|[;&|]|[[:space:]])git[[:space:]]+commit([[:space:]]|$)'; then
  exit 0
fi

toplevel=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
if [ -z "$toplevel" ] || [ ! -f "$toplevel/project.example.ts" ]; then
  exit 0
fi

cd "$toplevel"
if "$SCRIPT_DIR/check-verify-state.sh" 1>&2; then
  exit 0
fi

echo "git commit の前に verify-project-info スキルを実行してください（Skill(\"verify-project-info\")）。" >&2
exit 2

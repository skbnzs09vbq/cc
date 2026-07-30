#!/usr/bin/env bash
# Claude Code PreToolUse hook (matcher: Bash). Reads the tool-call payload
# from stdin, and if it's a `git commit`/`git push` invocation happening
# inside the .claude (cc.git) repo itself, blocks it (exit 2) when the
# git policy forbids it, or (for commit only) when verify-state is stale,
# so Claude runs the verify-no-project-leak skill first.
# Commits/pushes elsewhere (e.g. a product-repo worktree) are left untouched.
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

is_commit=0
is_push=0
echo "$command" | grep -qE '(^|[;&|]|[[:space:]])git[[:space:]]+commit([[:space:]]|$)' && is_commit=1
echo "$command" | grep -qE '(^|[;&|]|[[:space:]])git[[:space:]]+push([[:space:]]|$)' && is_push=1

if [ "$is_commit" = 0 ] && [ "$is_push" = 0 ]; then
  exit 0
fi

toplevel=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
if [ -z "$toplevel" ] || [ ! -f "$toplevel/project.example.ts" ]; then
  exit 0
fi

cd "$toplevel"

if [ "$("$SCRIPT_DIR/read-git-policy.sh")" = "no-commit" ]; then
  echo "この .claude は commit・push 禁止に設定されています（.claude/local/git-policy.json）。setup スキルで方針を変更できます。" >&2
  exit 2
fi

if [ "$is_commit" = 1 ] && ! "$SCRIPT_DIR/check-verify-state.sh" 1>&2; then
  echo "git commit の前に verify-no-project-leak スキルを実行してください（Skill(\"verify-no-project-leak\")）。" >&2
  exit 2
fi

exit 0

---
name: sync-pr-patterns
description: 過去の PR コメント・レビューを収集し、投稿者種別（AI / ヒューマン）で分類したうえで .claude/local/pr-review-patterns.md（PR_PATTERNS）を再構築する。review-diff が参照するパターン集を最新化したい時に使う。
argument-hint: "workingDir: <ディレクトリ>"
user-invocable: true
model: opus
---

`skill.ts` を読み、その内容に従って実行する

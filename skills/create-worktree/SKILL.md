---
name: create-worktree
description: issue番号をキーに worktree を作成する（既にあれば再利用）。branch を指定すれば既存ブランチをチェックアウトし、無指定なら BASE_BRANCH から新規作成する。作成した worktree のパスを返す。
argument-hint: "issueNumber: <issue番号>, branch: <既存ブランチ名 or null>"
user-invocable: true
model: haiku
---

`skill.ts` を読み、その内容に従って実行する。

---
name: dev-server
description: worktree/ブランチ名を受け取り、その環境で DEV_COMMAND を起動する（既に他の worktree で起動中なら停止してから切り替える）。引数無しならステータス表示のみ。
argument-hint: "target: <worktree名 or ブランチ名 or issue番号 or null>"
user-invocable: true
model: haiku
---

`skill.ts` を読み、その内容に従って実行する

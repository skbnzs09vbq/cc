---
name: request
description: 特定の worktree（issue 番号）への作業依頼をキューに積む。送信自体は行わず、次の dispatch-work が優先的に拾って送るため、dev サーバーの切り替えやテストの排他といった統制がそのまま効く。cron を動かしていないセッションから指示を出したい時に使う。
argument-hint: "action: <add|list|clear>, issue: <issue番号 or null>, message: <送りたい内容 or null>, force: <true: talking中でも割り込む / false>"
user-invocable: true
model: sonnet
---

`../../src/request/skill.ts` を読み、その内容に従って実行する

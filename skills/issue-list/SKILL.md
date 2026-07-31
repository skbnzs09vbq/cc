---
name: issue-list
description: タスク管理ツールの open issue 一覧を取得する。type 未指定なら project.ts の TASK_TRACKER を使う。github のみ具体実装、それ以外は該当 MCP ツールを探して取得する。
argument-hint: "type: <notion/github/linear/backlog/'' or null>, assigneeOnly: <true/false>"
user-invocable: true
model: haiku
---

`skill.ts` を読み、その内容に従って実行する。

---
name: issue-create
description: タスク管理ツールに issue を作成する。type 未指定なら project.ts の TASK_TRACKER を使う。github のみ具体実装、それ以外は該当 MCP ツールを探して作成する。並行実行を想定し、本文は呼び出し側が指定した一意な一時ファイルに書き出してから作成する。
argument-hint: "type: <notion/github/linear/backlog/'' or null>, title: <タイトル>, body: <本文Markdown>, tempFilePath: <一意な一時ファイルパス>"
user-invocable: true
model: haiku
---

`skill.ts` を読み、その内容に従って実行する。

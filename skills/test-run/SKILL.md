---
name: test-run
description: テストシナリオ（.claude/local/test-scenarios.md があればそれを使い、無ければ test-scenario で洗い出す）を、API シナリオは test-api、UI シナリオは test-e2e に振り分けて実際に検証する。issue/PR 対応後の動作確認を API・E2E 両面でまとめて行いたい時に使う。
argument-hint: "workingDir: <ディレクトリ>, content: <実装内容>, serverCommand: <開発サーバー起動コマンド or null>, port: <ポート番号 or null>"
user-invocable: true
model: sonnet
---

`../../src/test/run/skill.ts` を読み、その内容に従って実行する

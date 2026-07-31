---
name: test-e2e
description: Playwright（Python）でローカルWebアプリの動作を実際に検証する。指定した内容が正しく動作するかブラウザ操作で確認し、証拠となるスクリーンショットを撮る。issue/PR対応後のE2E検証に使う。
argument-hint: "workingDir: <ディレクトリ>, description: <何を検証するか>, serverCommand: <開発サーバー起動コマンド or null>, port: <ポート番号 or null>"
user-invocable: true
model: sonnet
---

`skill.ts` を読み、その内容に従って実行する。

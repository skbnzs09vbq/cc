---
name: test-scenario
description: 実装内容から検証すべきテストシナリオ（正常系・異常系・境界値、UI/API 別）を詳細に洗い出し、.claude/local/test-scenarios.md に保存する。TEST_POLICY_URL があればその方針も反映する。実装前の観点整理や、test-run/test-e2e に渡す検証内容の作成に使う。
argument-hint: "workingDir: <ディレクトリ or null>, content: <実装内容（plan.md 本文・issue 本文・実装内容テキスト）>"
user-invocable: true
model: sonnet
---

`skill.ts` を読み、その内容に従って実行する

---
name: setup
description: project.example.ts をもとに .claude/local/project.ts の定数を対話形式で作成・更新する。project.ts が無い状態で他のスキルを使い始める前、または既存の定数値を更新したい時に実行する。
argument-hint: "[update] [<定数名...>]"
user-invocable: true
model: sonnet
---

`skill.ts` を読み、その内容に従って実行する。

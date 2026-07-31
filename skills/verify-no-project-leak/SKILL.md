---
name: verify-no-project-leak
description: project.example.ts・CLAUDE.md・agents/・skills/ 配下に project 固有の実値や秘密情報が紛れ込んでいないか確認し、問題なければ検証状態を記録する。pre-commit フックが「未検証」を検知した時、またはこれらのファイルを変更した後に実行する。
user-invocable: true
model: haiku
---

`skill.ts` を読み、その内容に従って実行する

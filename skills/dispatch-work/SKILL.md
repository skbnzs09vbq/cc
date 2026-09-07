---
name: dispatch-work
description: 各 worktree の progress.md を読み、優先度が最も高い1件にだけ次の作業指示を herdr agent セッションへ送る（実装・レビュー自体はここでは行わない）。初回実行時に10分おきの定期実行を自分で登録し、progress.md が無い worktree にはその作成を依頼する。テスト系の指示を送る時だけ dev サーバーを対象 worktree に切り替え、その間は他の worktree にテストを依頼しない。
user-invocable: true
model: haiku
---

`../../src/dispatch-work/skill.ts` を読み、その内容に従って実行する

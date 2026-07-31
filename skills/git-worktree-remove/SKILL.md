---
name: git-worktree-remove
description: issue番号をキーに、git-worktree-create が作った worktree を削除する。未コミットの変更・未追跡ファイルがある場合は確認してから強制削除する。VSCODE_WORKSPACE_FILE が設定されていれば、そちらからも該当フォルダを取り除く。ブランチ自体は削除しない。
argument-hint: "issueNumber: <issue番号>"
user-invocable: true
model: haiku
---

`skill.ts` を読み、その内容に従って実行する

---
name: progress
description: この worktree の作業状況（status・いま何をしているか・完了/次の予定・確認事項）を .claude/local/progress.md に記録する。引数なしなら現状を表示するだけ。親セッションがこのファイルを見て次の指示を決めるため、作業の区切りごとに更新する。
argument-hint: "workingDir: <ディレクトリ or null>, status: <idle|planning|implementing|verifying|reviewing|done|talking|blocked or null>, now: <いまの作業>, done: <完了した内容の配列>, next: <次の予定の配列>, questions: <確認事項の配列>, resolved: <解消した確認事項の配列>, pending: <保留シナリオ件数 or null>"
user-invocable: true
model: sonnet
---

`../../src/progress/skill.ts` を読み、その内容に従って実行する

---
name: board
description: 全 worktree の progress.md と GitHub 側の未着手（PR の指摘・コンフリクト・レビュー依頼）を集め、次に何をすべきかが分かる形で一覧表示する。引数に「issue番号 メッセージ」を渡すとその worktree への依頼をキューに積み、次の dispatch-work が送る。親セッションで作業状況を把握・指示したい時に使う。
argument-hint: "<なし: 状況表示のみ> | <issue番号> <送る内容> | !<issue番号> <送る内容>（talking中でも割り込む）"
user-invocable: true
model: sonnet
---

`../../src/board/skill.ts` を読み、その内容に従って実行する

---
name: git-pr-review-post
description: 指定した PR の最新コミットに対して、複数の指摘をまとめて1回のレビューでインラインコメントとして投稿する。改行・引用符を含む本文も JSON ペイロードファイル経由で安全に扱う。
argument-hint: "workingDir: <ディレクトリ>, prNumber: <PR番号>, findings: <{path,line,title,body}の配列>"
user-invocable: true
model: haiku
---

`skill.ts` を読み、その内容に従って実行する。

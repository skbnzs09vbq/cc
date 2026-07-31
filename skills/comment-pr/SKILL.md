---
name: comment-pr
description: 指定した PR に本文をコメントとして投稿する。改行・引用符を含む本文も安全に扱い、スクリーンショットがあれば公開 URL 化して埋め込む。
argument-hint: "workingDir: <ディレクトリ>, prNumber: <PR番号>, body: <コメント本文>, screenshots: <ローカルファイルパスの配列 or null>"
user-invocable: true
model: haiku
---

`skill.ts` を読み、その内容に従って実行する。

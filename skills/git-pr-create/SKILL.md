---
name: git-pr-create
description: 指定したディレクトリで gh pr create を実行し PR を作成する。title/description が未定の場合は git-pr-draft で決定する。作成した PR の URL を返す。
argument-hint: "workingDir: <ディレクトリ>, head: <ブランチ名>, base: <分岐元ブランチ名 or null>, title: <タイトル or null>, description: <本文 or null>, closesIssue: <issue番号 or null>, screenshots: <ローカルファイルパスの配列 or null>"
user-invocable: true
model: haiku
---

`skill.ts` を読み、その内容に従って実行する

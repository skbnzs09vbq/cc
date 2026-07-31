---
name: git-pr-review-verify
description: 指定した PR の未解決レビュースレッドそれぞれについて、最新コミットで対応できているか判定する。対応済みと判断したスレッドは実際に resolveReviewThread mutation で resolved にする。
argument-hint: "workingDir: <ディレクトリ>, prNumber: <PR番号>"
user-invocable: true
model: haiku
---

`skill.ts` を読み、その内容に従って実行する。

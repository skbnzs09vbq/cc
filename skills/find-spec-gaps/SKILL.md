---
name: find-spec-gaps
description: items（文字列配列）のうち existing（文字列配列）で対応済みでない項目を返す。existing が null の場合、workingDir（未指定なら project.ts の PROJECT_ROOT）/GUIDELINES から実際のコードベースの実装状況を調べて existing の代わりに使う。判定基準は similarityLevel（1〜3、既定2）。
argument-hint: "items: <文字列配列>, existing: <文字列配列 or null>, workingDir: <ディレクトリ or null>, similarityLevel: <1/2/3 or null>"
user-invocable: true
model: sonnet
---

`skill.ts` を読み、その内容に従って実行する。

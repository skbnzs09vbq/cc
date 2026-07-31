---
name: git-conflict-resolve
description: 指定したディレクトリで base ブランチを取り込み、両実装の機能を両立させる形でコンフリクトを解消して push する。force:false の場合、安全に両立できないと判断したら無理に解消せず resolved:false で理由を返す。force:true の場合は必ず解消する。
argument-hint: "workingDir: <ディレクトリ>, baseBranch: <取り込むブランチ名 or null>, force: <true/false>"
user-invocable: true
model: haiku
---

`skill.ts` を読み、その内容に従って実行する。

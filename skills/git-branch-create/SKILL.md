---
name: git-branch-create
description: 指定したディレクトリ内で branchName のブランチを作成する。baseBranch があれば git fetch 後に origin/<baseBranch> を起点に、なければ既にチェックアウト済みのブランチを起点にする。branchName が未定の場合は workDescription から git-branch-name で決定する。
argument-hint: "workingDir: <ディレクトリ>, branchName: <ブランチ名 or null>, baseBranch: <分岐元ブランチ名 or null>, workDescription: <branchNameがnullの場合の作業内容 or null>"
user-invocable: true
model: haiku
---

`skill.ts` を読み、その内容に従って実行する

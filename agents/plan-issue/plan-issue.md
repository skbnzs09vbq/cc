---
name: plan-issue
description: plan-issue スキルを実行するエージェント。PR 重複時は理由を添えて中止し、計画は自動承認して進める。
tools: "*"
---

`plan-issue.ts` を読み、その内容に従って実行してください。

- 重複しそうな PR の有無を確認された場合、重複の疑いがあれば計画立案を中止してください（無理に続行しない）。
  中止した場合は `aborted: true` と、`reason` に中止理由（該当する PR 番号・タイトルなど）を具体的に書いて返してください。
  `issueId`・`planContent` は null にしてください。
- 作成した計画の承認を求められた場合、内容に明らかな問題がなければその場で承認して次に進めてください（フィードバックループは待たない）。
  中止せず完了した場合は `aborted: false`、`reason: null` とし、`issueId`・`planContent` を返してください。

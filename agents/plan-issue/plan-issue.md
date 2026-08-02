---
name: plan-issue
description: plan-issue スキルを実行するエージェント。PR 重複時は理由を添えて中止し、計画は自動承認して進める。
tools: "*"
---

`plan-issue.ts` を読み、その内容に従って実行してください。

- 重複しそうな PR の有無を確認された場合、重複の疑いがあれば計画立案を中止してください（無理に続行しない）。
- 重複判定は `plan-issue.ts` が行う open/draft PR チェックの結果のみを根拠にしてください。
  `.claude/local/running-workflows.json` や `CronList` を自発的に確認して「他に並行実行中のワークフローがある」ことを重複の根拠にしないでください。
  auto-dev は複数 issue を同時並行で処理する設計であり、running-workflows.json に他issueのエントリ（自分自身のエントリを含む）が存在するのは正常な状態で、重複の兆候ではありません。
- 作成した計画の承認を求められた場合、内容に明らかな問題がなければその場で承認して次に進めてください（フィードバックループは待たない）。
- `planIssue()`（`plan-issue.ts`）の戻り値は `{aborted, reason, issueId, planContent}` の4フィールドを持ちます。
  この戻り値をそのまま使って返してください。フィールドを自分で捏造・補完しないでください。

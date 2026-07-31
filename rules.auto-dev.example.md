# Rules

## GitHub 操作

- `git switch`（ブランチ切り替え）は、実行中の workflow（auto-dev に限らない）の判断に任せてよい
- `auto-dev` workflow は自律実行が前提のため、ユーザーの許可を得ずに以下を行ってよい
    - `git commit` / `git push`
    - PR の作成
    - PR への加筆・編集・コメント
    - `pr-review-workflow.js` が自身の判断で行う PR のマージ

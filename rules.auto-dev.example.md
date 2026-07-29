# Rules

## GitHub 操作

- `git switch` はどの workflow 判断に委ねてよい
- `auto-dev` workflow は自律実行が前提のため、`git commit`・`git push`・PR 作成をユーザーの許可なく自動で行ってよい
- `auto-dev` workflow は、PR への加筆・編集・コメントをユーザーの許可なく行ってよい
- `auto-dev` の PR レビュー workflow（`pr-review-workflow.js`）が「指摘なし」または「指摘に対する修正が完了した」と判断した場合のみ、`pr-review-workflow.js` 自身がマージを実行してよい

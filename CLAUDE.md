# Rules

## project 固有情報の扱い（最優先の禁止事項）

- project 固有の情報（project.ts の実値、guidelines.md、pr-review-patterns.md、tasks/ 配下の作業ファイル、commands.md 等）は必ず `.claude/local/` 配下に置く
- `skill.ts`・`project.example.ts`・`CLAUDE.md`・`agents/` 等には書き込まない
- `.claude/local/` は、テンプレート（`project.example.ts` 等）を実値化したものや生成物を置く場所
- `.claude/local/` は `.gitignore` でフォルダ構造だけ追跡され、中身（ファイル）は追跡されない

CLAUDE.md 内に、具体的なファイル名・ツール名・値などプロジェクト固有の詳細を書き足したくなった場合

- **CLAUDE.md 自体は編集禁止**。書き足す先は必ず `.claude/local/rules.md`（無ければ新規作成）
- ファイルは増やさない。`.claude/local/rules.md` の1本に固定し、常にここへ追記する
- `.claude/local/rules.md` 内では、CLAUDE.md側の該当セクションと同じ見出し（例: `## GitHub 操作`）を使って追記する
- CLAUDE.md 側には汎用的でそれ単体でも機能するルール本文を残す。`.claude/local/rules.md` 側は、それに上乗せする具体化・詳細だけを書く

## GitHub 操作

- `git commit`, `git push` および PR 作成は、ユーザーの明示的な許可を得てから実行すること
- ユーザーの許可なく PR に加筆・編集・コメントを行わないこと
- 担当者（`ASSIGNEE`）以外のアカウントが担当する PR に対して、read 以外の操作（編集・コメント・マージ等）を行わないこと。`ASSIGNEE` の値は `.claude/local/project.ts` を参照する
- PR のマージは絶対に行わないこと（担当者・権限問わず）
- **例外（auto-dev workflow）**: `.claude/src/auto-dev/*-workflow.js` から起動された agent 呼び出しは自律実行が前提のため、上記の許可確認を待たず以下を行ってよい
    - `git commit` / `git push`
    - PR の作成
    - PR への加筆・編集・コメント
    - `review-workflow.js` が自身の判断で行う PR のマージ
  （`git switch` によるブランチ切り替えも、実行中の workflow の判断に任せてよい）

## Slack

- 読み取りのみ許可。チャンネル・スレッド・ファイル・ユーザー情報などの取得・検索は可
- メッセージの送信・投稿・下書き・スケジュール送信・リアクション追加・Canvas の作成・編集は絶対に行わないこと（`slack_send_message` / `slack_send_message_draft` / `slack_schedule_message` / `slack_add_reaction` / `slack_create_canvas` / `slack_update_canvas` 等の write 系 MCP ツールは使用禁止）

## Notion

- 読み取りのみ許可

## Figma

- 閲覧（read）のみ許可。デザインの取得・参照・スクショ・メタデータ取得などは可
- 作成・編集・書き込み・アップロード・同期は絶対に行わないこと（`use_figma` / `create_new_file` / `generate_diagram` / `generate_figma_design` / `upload_assets` / `add_code_connect_map` / `send_code_connect_mappings` 等の write 系 MCP ツールは使用禁止）

スキルは `.claude/skills/{name}/SKILL.md`（呼び出し口）と `.claude/src/{name}/skill.ts`（実装）に分かれる。作成・編集する際の規約は `.claude/src/CLAUDE.md` を参照。

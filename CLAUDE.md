# Rules

**`.claude/local/rules.md` があれば、その内容をこのファイルより必ず優先する。** 以降の各セクション（GitHub 操作・Slack 等）の内容を根拠に判断・行動する際は、その都度 `.claude/local/rules.md` に同じ見出しがないか確認し、あれば必ずそちらを先に適用すること（冒頭で一度読んだだけで満たしたことにしない）

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

## Slack

- 読み取りのみ許可。チャンネル・スレッド・ファイル・ユーザー情報などの取得・検索は可
- メッセージの送信・投稿・下書き・スケジュール送信・リアクション追加・Canvas の作成・編集は絶対に行わないこと（`slack_send_message` / `slack_send_message_draft` / `slack_schedule_message` / `slack_add_reaction` / `slack_create_canvas` / `slack_update_canvas` 等の write 系 MCP ツールは使用禁止）

## Notion

- 読み取りのみ許可

## Figma

- 閲覧（read）のみ許可。デザインの取得・参照・スクショ・メタデータ取得などは可
- 作成・編集・書き込み・アップロード・同期は絶対に行わないこと（`use_figma` / `create_new_file` / `generate_diagram` / `generate_figma_design` / `upload_assets` / `add_code_connect_map` / `send_code_connect_mappings` 等の write 系 MCP ツールは使用禁止）

## project.ts 定数の参照

`.claude/local/project.ts` の定数を使うスキルは、`skill.ts` 冒頭で `../../local/project.js` から
使う定数だけを実際に import する（`Read` ではなく本物の ES module import。この import 手順自体は
各スキルの `SKILL.md` に書く必要はない）。ただしファイルが存在しない場合は import が解決できないため、
import の前提として以下を行うこと:

```py
if not exists('.claude/local/project.ts'):
    Skill('setup', '<そのスキルが使う定数名を空白区切りで>')
```

## JS参照ファイル形式のスキルで使う共通規約

`.claude/skills/{name}/SKILL.md` が frontmatter + JS ファイル参照のみで構成される場合、
その JS ファイルは `.claude/skills/_shared/` の共通関数を使う。各記法の意味は以下の通り
（node で実行されることは想定していない。実行者自身がこの表に従って振る舞う）:

| 記法                                    | 意味                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| `Schema`                                | complete() 等に渡す JSON Schema 風の型（`_shared/complete.ts` で定義。実際に使う範囲だけの部分集合） |
| `complete<T>(prompt, schema?)`          | プロンプト送信点。API は呼ばず、実行者自身が prompt の内容に従って結果をその場で生成する。schema があれば返り値の形を保証する |
| `generate(prompt)`                      | complete() のラッパー。文字列として結果を受け取る                                          |
| `buildCommandPrompt(prompt, commands)`  | prompt と実行コマンド配列から complete() 用の文章を組み立てる。結果が得られない・失敗した場合は null を返す指示がデフォルトで入る |
| `runCommand(commands)`                  | commands を実際に実行し、その結果を文字列（または失敗時 null）として返す                   |
| `remember(notes)`                       | notes の配列から、スクリプト全体を通して守るべき制約を宣言する                             |
| `respond(value)`                        | value をユーザーに表示する。ファイル末尾（後続処理がない箇所）で「スクリプトの最終出力」として使う |
| `receive<T>(schema?)`                   | 直前に respond() で提示した内容に対する、ユーザーからの回答を受け取る（complete() で構造化する。内容の出所がユーザーである点だけが complete() の自己生成と異なる） |
| `askUser<T>(message, schema?)`          | respond(message) と receive() の組み合わせ。message をユーザーに提示し、回答を受け取って返す |
| `exit(value?)`                          | value を（あれば）表示し、以降の処理を打ち切る（早期終了用。トップレベル `return` はモジュールとして文法違反になるため使わない） |
| `readFile(path)`                        | 実際の fs 呼び出しではなく、実行者自身が Read ツールで path を読み、内容（無ければ null）を返す |
| `writeFile(path, content)`              | 実際の fs 呼び出しではなく、実行者自身が Write/Edit ツールで path に content を書き込む      |
| `runTool(tool)`                         | runCommand() の MCP ツール版。tool（呼び出すツール名・引数の説明）を実際に呼び出し、結果をそのまま返す |
| `` dedent`...` ``                       | テンプレートリテラルの共通インデントを除去するタグ関数。ソース上の字下げと実行時の文字列を分離する |
| `phase(title)`                          | 区切りを示すだけの目印（Workflow の phase() を模した書き方。実処理は何もない）             |
| `args`                                  | 実際の注入機構ではないプレースホルダ。このスキル呼び出し時に渡された引数を表す              |
| `getArgs<T>(schema)` / `parseArgs()`    | `_shared/args.ts`。args を schema の形に構造化して取得する / args を自由記述の引数文字列として取得する |

個々の記法とは別に、複数のスキルで共通する構成上の規約:

- 各 `phase(title)` の直前に、同じ title を含む区切りコメント（`// ─── Phase N: title ─────` 形式）を置く
- `SCREAMING_SNAKE_CASE` は Schema 定数に限らず、`OUTPUT_FORMAT`・`TEMPLATE_PATH` 等「一度定義して使い回す設定値」全般に使う。実行時に決まる値は camelCase
- `remember(notes)` を使う場合は import・定数宣言の直後、最初の `phase()` より前に置く
- `Skill(name, ...)` の戻り値は常に自由文字列として扱う。構造化データが必要なら `complete(prompt, schema)` で再構造化し、`Skill()` 自体がオブジェクトを返すとは想定しない
- `Agent({...})` は `subagent_type` → `description` → `prompt`（`dedent` で組み立てる）の順で呼ぶ
- 存在しないかもしれないファイルの読み込みは `readFile(path)` を使う（`runCommand(['cat ... || echo ""'])` のようなシェル経由の代替は使わない）
- サブコマンド形式の引数解析は `getArgs<T>(schema)` で一括構造化する（`parseArgs()` を条件分岐で手動パースしない）
- ユーザーが承認するまで確認・修正を繰り返す処理は、`approved`/`feedback` のような schema を持つ `askUser<T>()` をループで呼び、`feedback` があれば `complete()` で再生成する形にする
- 呼び出すツールが実行時にしか決まらない場合、`runTool(tool)`/`complete()` の説明文の中に `ToolSearch("select:...")` を呼ぶ指示を埋め込む
- schema で受け取った配列を複数箇所で扱うなら `type Foo = {...}` を宣言して使い回す（1箇所でしか使わないならインラインの匿名型でよい）

// プロジェクト定数（テンプレート）。setup スキルがこれを元に .claude/local/project.ts を作成・更新する。

/** GitHub リポジトリ URL */
export const TARGET_REPO = 'https://github.com/<org>/<repo>'

/** GitHub アカウント名 */
export const ASSIGNEE = '<github-user-id>'

/** チケット ID の接頭辞 */
export const TICKET_PREFIX = 'XXX'

/** ブランチの分岐元・PR のベースブランチ */
export const BASE_BRANCH = 'main'

/** リポジトリのローカル絶対パス */
export const PROJECT_ROOT = '/path/to/project'

/** create-worktree が新規 worktree 作成後にフォルダを追加する VSCode の .code-workspace ファイルの絶対パス（任意）。空文字なら何もしない */
export const VSCODE_WORKSPACE_FILE = ''

/** タスク管理ツールの種類 */
export const TASK_TRACKER: 'notion' | 'github' | 'linear' | 'backlog' | '' = 'github'

/** auto-dev など自律実行系のスキルをこのプロジェクトで使うか */
export const USE_AUTO_DEV = false

/** テスト方針ドキュメントのパス（任意） */
export const TEST_POLICY_URL = ''

/** PR テンプレートのパス（任意） */
export const PR_TEMPLATE_PATH = '.github/pull_request_template.md'

/** 実装指針ファイルのパス（sync-guidelines が生成・更新） */
export const GUIDELINES = '.claude/local/guidelines.md'

/** PR レビューパターン集のパス（review-diff が参照・更新） */
export const PR_PATTERNS = '.claude/local/pr-review-patterns.md'

/** issue ごとの作業ディレクトリ */
export const TASK_DIR = '.claude/local/tasks/'

/** create-worktree が新規 worktree 作成後に順番に実行するセットアップコマンド一覧（依存インストール・ビルド等）。空配列なら何も実行しない */
export const WORKTREE_SETUP_COMMANDS: string[] = []

/** lint コマンド。{files} は変更ファイル一覧 */
export const LINT_COMMAND = 'npx eslint {files}'

/** lint 自動修正コマンド */
export const LINT_FIX_COMMAND = 'npx eslint --fix {files}'

/** 型チェックコマンド */
export const TYPECHECK_COMMAND = 'npx tsc --noEmit'

/** モノレポの workspace ディレクトリ名（任意） */
export const MONOREPO_APPS_DIR = ''

/** review-diff で Tailwind arbitrary value チェックを行うか */
export const TAILWIND_CHECK = false

/** auto-dev が同時実行を許可する workflow の最大数 */
export const AUTO_DEV_MAX_CONCURRENT = 10

/** auto-dev が起動先を選ぶ目標比率: auto-dev workflow */
export const AUTO_DEV_RATIO_AUTO_DEV = 4

/** auto-dev が起動先を選ぶ目標比率: pr-review workflow */
export const AUTO_DEV_RATIO_PR_REVIEW = 4

/** auto-dev が起動先を選ぶ目標比率: direction workflow */
export const AUTO_DEV_RATIO_DIRECTION = 2

/** auto-dev の issue 対応で、レビュー・E2E検証を最大何回繰り返すか */
export const AUTO_DEV_ISSUE_MAX_ITERATIONS = 1

/** 調査対象ソース一覧。type は読み取り専用 MCP ツールがある種別なら自由（slack・notion・github 等） */
export const RESEARCH_SOURCES: { type: string; value: string; label?: string }[] = [
  { type: 'slack', value: '#<channel>', label: '<説明>' },
  { type: 'notion', value: 'https://app.notion.com/p/<workspace>/<page-id>', label: '<説明>' },
]

// ── フォーマット系（setup は既定値を提示し、変更したい場合のみ聞く） ──

/** {type} の選択肢（コミット・ブランチ・PR 共通） */
export const TYPES = ['feat', 'fix', 'refactor', 'chore', 'test', 'docs']

/** コミットメッセージの形式 */
export const COMMIT_FORMAT = '{type}: {TICKET_PREFIX}-{番号} {説明}'

/** コミットメッセージの言語 */
export const COMMIT_LANG: 'en' | 'ja' = 'en'

/** 本文・箇条書きを許可するか */
export const COMMIT_ALLOW_BODY = false

/** ブランチ名の形式。{ticket-id} は "{TICKET_PREFIX}-番号" */
export const BRANCH_FORMAT = '{type}/{ticket-id}-{kebab-case-概要}'

/** PR タイトルの形式 */
export const PR_TITLE_FORMAT = '{type}: {TICKET_PREFIX}-{番号} {概要}'

/** PR タイトル・概要の言語 */
export const PR_LANG: 'en' | 'ja' = 'en'

/** draft-issue が出力する issue テンプレート */
export const ISSUE_TEMPLATE = `
# {タイトル}

## 目的

{なぜやるか・背景。1〜3 文程度}

## 作業内容（チェックリスト）

- [ ]  {作業ステップ 1}
- [ ]  {作業ステップ 2}

## 成果物

{完了時に何が出来上がっているか}

## 依存関係

{先に終わっている必要がある issue・外部要因。なければ「なし」}

## 参考

{関連 URL・資料。なければ省略可}
`

/** sync-guidelines が使うカテゴリ名の例 */
export const GUIDELINES_CATEGORY_EXAMPLES = [
  '型・定数',
  'UI コンポーネント',
  '状態管理',
  'API・バックエンド',
  'UX',
  '差分・PR',
]

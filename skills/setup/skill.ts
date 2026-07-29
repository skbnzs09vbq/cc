import { getArgs } from '../_shared/args.js'
import {
  type Schema,
  askUser,
  exit,
  generate,
  readFile,
  respond,
  runCommand,
  writeFile,
} from '../_shared/complete.js'
import { dedent } from '../_shared/utils.js'

const TEMPLATE_PATH = '.claude/project.example.ts'
const OUTPUT_PATH = '.claude/local/project.ts'

const AUTO_DEV_TEMPLATE_PATH = '.claude/rules.auto-dev.example.md'
const RULES_PATH = '.claude/local/rules.md'

const ARGS_SCHEMA: Schema = {
  type: 'object',
  properties: {
    mode: {
      type: 'string',
      enum: ['add', 'update'],
      description: '先頭トークンが "update" なら update、それ以外は add',
    },
    names: {
      type: 'array',
      items: { type: 'string' },
      description:
        '対象の定数名一覧。update の場合は先頭の "update" を除いた残りのトークン、add の場合は全トークン',
    },
  },
  required: ['mode', 'names'],
}

const { mode, names } = getArgs<{ mode: 'add' | 'update'; names: string[] }>(ARGS_SCHEMA)

const output = readFile(OUTPUT_PATH)
const isInitialSetup = !output

// ─── Phase 1: 定数の値を確認 ─────────────────────────────────
phase('定数の値を確認')

const template = readFile(TEMPLATE_PATH)

const VALUES_SCHEMA: Schema = {
  type: 'object',
  description:
    '対象定数名をキー、確定値を値としたオブジェクト。確認・変更が不要な定数はキーごと含めない',
}

const finalValues = askUser<Record<string, string>>(
  dedent`
    以下のテンプレートと現在の設定をもとに、対象の定数の値を確認してください。

    対象: ${names.length ? names.join(', ') : mode === 'add' ? '全定数のうち未設定のもの' : '全定数'}

    - ${mode === 'add' ? '既に値が設定されている定数は対象から除外する' : '指定された定数はすべて対象にする（既存値があっても変更するか確認する）'}
    - git remote / gh コマンド等で自動検出できる値があれば検出し、「この値でよいか」を確認する
    - 現在値があれば「現在値 → 変更するか」を確認する
    - テンプレートに既定値があればそれを提示し、変更したい場合のみ新しい値を聞く
    - いずれもなければ値を質問する（不明・未使用なら空欄でよい旨を伝える）
    - 確認・質問は長文の一括箇条書きではなく、選択式 UI（1問につき2〜4択、1回につき最大4問）のダイアログで行う。
      enum・boolean・既知候補（現在値／自動検出値／テンプレート既定値／変更する 等）がある定数は選択肢として提示する。
      URL・パスなど自由記述が必要な定数のみ、選択肢の中に「自由入力」を含めるか個別にテキストで質問する
    - 対象定数が5件を超える場合は、関連する定数ごとにまとめて複数回に分けて聞く（1回に詰め込みすぎない）

    テンプレート:
    ${template}

    現在の設定（無ければ未設定として扱う）:
    ${output || '(なし)'}
  `,
  VALUES_SCHEMA,
)

if (Object.keys(finalValues).length === 0 && !isInitialSetup) {
  exit('対象の定数は設定済みです')
}

// ─── Phase 2: OUTPUT の作成・更新 ────────────────────────────
phase('OUTPUT の作成・更新')

const newContent =
  Object.keys(finalValues).length === 0
    ? output!
    : generate(
        output
          ? dedent`
            以下の既存内容のうち、次の値に該当する定数の宣言だけを更新してください（他の宣言はそのまま保持する）。

            既存内容:
            ${output}

            更新する値:
            ${JSON.stringify(finalValues)}
          `
          : dedent`
            以下のテンプレートと同じ構造（export const 宣言・JSDoc コメント・区切りコメント）で、
            次の値に該当する定数だけ値を置き換えて新規作成してください（それ以外はテンプレートの既定値のまま残す）。

            テンプレート:
            ${template}

            更新する値:
            ${JSON.stringify(finalValues)}
          `,
      )

writeFile(OUTPUT_PATH, newContent)

respond(`${OUTPUT_PATH} を更新しました（対象: ${Object.keys(finalValues).join(', ') || 'なし'}）`)

// ─── Phase 3: auto-dev の有効化 ─────────────────────────────
phase('auto-dev の有効化')

if (isInitialSetup && /USE_AUTO_DEV\s*=\s*true/.test(newContent)) {
  const rulesContent = readFile(RULES_PATH)
  const autoDevTemplate = readFile(AUTO_DEV_TEMPLATE_PATH)
  const merged = rulesContent
    ? generate(dedent`
        以下の既存内容に、次のテンプレート内容を追記してください。
        既存内容に同じ見出し（例: "## GitHub 操作"）が既にあれば、新規見出しを作らずそのセクション内に自然に統合する。

        既存内容:
        ${rulesContent}

        追記するテンプレート:
        ${autoDevTemplate}
      `)
    : autoDevTemplate!
  writeFile(RULES_PATH, merged)
  respond(`${RULES_PATH} に auto-dev 用ルールを追加しました`)
}

// ─── Phase 4: 初回コミット確認 ───────────────────────────────
phase('初回コミット確認')

if (isInitialSetup && /USE_AUTO_DEV\s*=\s*true/.test(newContent)) {
  const baseBranch = newContent.match(/BASE_BRANCH\s*=\s*['"]([^'"]+)['"]/)?.[1] || 'main'
  const hasCommits = runCommand(['git rev-parse --verify HEAD'])

  if (!hasCommits) {
    const { confirmed } = askUser<{ confirmed: boolean }>(
      'このリポジトリにはまだコミットが1つもありません。auto-dev の worktree 作成には最低1つのコミットが必要です。空の初回コミット（chore: initial empty commit）を作成してよいですか？',
      {
        type: 'object',
        properties: { confirmed: { type: 'boolean' } },
        required: ['confirmed'],
      },
    )

    if (confirmed) {
      runCommand(['git commit --allow-empty -m "chore: initial empty commit"'])
      respond('空の初回コミットを作成しました')

      const { confirmedPush } = askUser<{ confirmedPush: boolean }>(
        `この初回コミットを origin/${baseBranch}（project.ts の BASE_BRANCH）に push してよいですか？（worktree 作成には push 済みの状態が必要です）`,
        {
          type: 'object',
          properties: { confirmedPush: { type: 'boolean' } },
          required: ['confirmedPush'],
        },
      )

      if (confirmedPush) {
        runCommand([`git push -u origin HEAD:${baseBranch}`])
        respond('push しました')
      } else {
        respond('push は行いませんでした。push するまで auto-dev の worktree 作成は失敗します')
      }
    }
  }
}

// ─── Phase 5: 案内 ─────────────────────────────────────────
phase('案内')

if (/USE_AUTO_DEV\s*=\s*true/.test(newContent)) {
  respond('`/auto-dev` を実行して workflow を起動することができます')
}

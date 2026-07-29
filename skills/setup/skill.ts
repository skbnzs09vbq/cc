import { getArgs } from '../_shared/args.js'
import {
  type Schema,
  askUser,
  exit,
  generate,
  readFile,
  respond,
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

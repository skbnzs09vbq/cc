import {
  BASE_BRANCH,
  GUIDELINES,
  LINT_COMMAND,
  LINT_FIX_COMMAND,
  MONOREPO_APPS_DIR,
  PR_PATTERNS,
  TAILWIND_CHECK,
  TYPECHECK_COMMAND,
} from '../../local/project.js'
import { checkTailwind } from '../check-tailwind/skill.js'
import { getArgs } from '../_shared/args.js'
import {
  type Schema,
  buildCommandPrompt,
  complete,
  generate,
  respond,
  runCommand,
} from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'
import { dedent } from '../_shared/utils.js'

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    workingDir: { type: 'string', description: 'レビュー対象の作業ディレクトリ' },
  },
  required: ['workingDir'],
} as const satisfies Schema

const CHECK_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    clean: { type: 'boolean', description: '問題が一切ないかどうか' },
    findings: {
      type: ['string', 'null'],
      description:
        'string: clean が false の場合の、出力フォーマットに従って整形した指摘内容, null: clean が true の場合',
    },
  },
  required: ['clean', 'findings'],
} as const satisfies Schema

export function reviewDiff(workingDir: string): Infer<typeof CHECK_RESULT_SCHEMA> {
  // ─── Phase 1: 前提ファイルの確認 ─────────────────────────────
  phase('前提ファイル確認')

  const prPatterns = runCommand([`cd ${workingDir} && cat ${PR_PATTERNS} 2>/dev/null || echo ""`])
  const guidelines = runCommand([`cd ${workingDir} && cat ${GUIDELINES} 2>/dev/null || echo ""`])

  // ─── Phase 2: 差分取得 ───────────────────────────────────────
  phase('差分取得')

  const diff = runCommand([`cd ${workingDir} && git diff ${BASE_BRANCH}...HEAD -- . ':!.claude'`])
  const changedFilesRaw = runCommand([
    dedent`
      cd ${workingDir}
      git diff --name-only --diff-filter=ACMR ${BASE_BRANCH}...HEAD | while read -r f; do
        [[ "$f" == .claude/* ]] && continue
        git check-ignore -q "$f" && continue
        echo "$f"
      done
    `,
  ])
  const changedFiles = (changedFilesRaw || '')
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean)
  const filesArg = changedFiles.join(' ')

  // ─── Phase 3: lint ───────────────────────────────────────────
  phase('lint')

  runCommand([`cd ${workingDir} && ${LINT_FIX_COMMAND.replace('{files}', filesArg)}`])
  const lintResult = runCommand([
    `cd ${workingDir} && ${LINT_COMMAND.replace('{files}', filesArg)}`,
  ])

  // ─── Phase 4: 型チェック ─────────────────────────────────────
  phase('型チェック')

  const workspaces =
    MONOREPO_APPS_DIR === ''
      ? ['.']
      : [
          ...new Set(
            changedFiles
              .filter((p) => p.startsWith(`${MONOREPO_APPS_DIR}/`))
              .map((p) => p.split(`${MONOREPO_APPS_DIR}/`)[1].split('/')[0]),
          ),
        ]

  const typecheckResults = workspaces.map((workspace) => {
    const prefix = MONOREPO_APPS_DIR === '' ? '' : `${MONOREPO_APPS_DIR}/${workspace}/`
    const workspaceFiles = prefix
      ? changedFiles.filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length))
      : changedFiles
    const filesArg = workspaceFiles.map((f) => `"${f}"`).join(' ')

    return {
      workspace,
      result: runCommand([
        dedent`
          cd ${workingDir}/${MONOREPO_APPS_DIR}/${workspace}
          ${TYPECHECK_COMMAND} 2>&1 | grep -F -f <(printf '%s\\n' ${filesArg}) || echo "変更ファイルに型エラーなし"
        `,
      ]),
    }
  })

  // ─── Phase 5: Tailwind arbitrary value チェック ─────────────
  phase('Tailwindチェック')

  const tailwindResult = TAILWIND_CHECK ? checkTailwind({ workingDir }) : null

  // ─── Phase 6: パターン集・指針との照合 ───────────────────────
  phase('パターン集・指針照合')

  const patternViolations = prPatterns
    ? generate(
        dedent`
          以下の差分を PR レビューパターン集の各カテゴリと照合してください
          推測で指摘せず、明確に該当するコードがある場合のみ報告してください（該当箇所・カテゴリ番号-項目番号・問題点・修正案を1件ずつ）
          該当がなければ「該当なし」とだけ返してください

          パターン集:
          ${prPatterns}

          差分（変更ファイル一覧 ${filesArg} にスコープを限定する）:
          ${diff}
        `,
      )
    : null

  const guidelineViolations = guidelines
    ? generate(
        dedent`
          以下の差分を実装指針（guidelines.md）の各指針と照合してください
          パターン集・指針に記載のない汎用的な指摘（一般的な型エラー・スタイル等）は行わないでください（該当箇所・指針タイトル・問題点・修正案を1件ずつ）
          該当がなければ「該当なし」とだけ返してください

          指針:
          ${guidelines}

          差分（変更ファイル一覧 ${filesArg} にスコープを限定する）:
          ${diff}
        `,
      )
    : null

  // ─── Phase 7: code-review スキルによるレビュー ─────────────────
  phase('code-reviewスキルによるレビュー')

  const codeReviewResult = Agent({
    subagent_type: 'general-purpose',
    description: 'code-review スキルによるレビュー',
    prompt: dedent`
      作業ディレクトリ: ${workingDir}

      code-review スキルの指示に従い、現在の差分（変更ファイル一覧 ${filesArg} にスコープを限定する）を
      正確性のバグ・再利用性/簡潔化/効率化の観点でレビューし、結果を報告してください
    `,
  })

  // ─── Phase 8: 出力フォーマットへの整形 ───────────────────────
  phase('出力フォーマットへの整形')

  const OUTPUT_TEMPLATE = dedent`
    #### [カテゴリ番号-項目番号] 項目名（パターン違反の場合）／{指針タイトル}（指針違反の場合）／{指摘タイトル}（code-review 指摘の場合）
    - ファイル: \`{path}:{line}\`
    - 問題: {何が問題か1行で}
    - 修正案: {具体的にどう直すか}
  `

  return complete(
    dedent`
      以下の各チェック結果を判定してください
      findings は出力フォーマットのテンプレートに従って、パターン違反・指針違反・code-review 指摘を1件ずつ整形してください

      lint エラー: ${lintResult || 'なし'}

      型チェック結果（ワークスペースごと）: ${JSON.stringify(typecheckResults)}

      ${TAILWIND_CHECK ? `Tailwind arbitrary value チェック結果: ${tailwindResult}` : 'Tailwind arbitrary value チェック: TAILWIND_CHECK が False のためスキップ'}

      パターン違反候補: ${patternViolations || '(パターン集なし)'}

      指針違反候補: ${guidelineViolations || '(指針なし)'}

      code-review 指摘: ${codeReviewResult}

      出力フォーマット（findings 用テンプレート）:
      ${OUTPUT_TEMPLATE}
    `,
    CHECK_RESULT_SCHEMA,
  )
}

respond(reviewDiff(getArgs(ARGS_SCHEMA).workingDir))

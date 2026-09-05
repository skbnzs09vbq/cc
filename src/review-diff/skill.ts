import {
  BASE_BRANCH,
  GUIDELINES,
  LINT_COMMAND,
  LINT_FIX_COMMAND,
  MONOREPO_APPS_DIR,
  PROJECT_ROOT,
  PR_PATTERNS,
  TAILWIND_CHECK,
  TYPECHECK_COMMAND,
} from '../../local/project.js'
import { checkTailwind } from '../check-tailwind/skill.js'
import { getArgs } from '../shared/args.js'
import {
  type Schema,
  buildCommandPrompt,
  complete,
  generate,
  respond,
  runCommand,
} from '../shared/complete.js'
import { gitIsWorktree } from '../shared/git.js'
import type { Infer } from '../shared/infer.js'
import { boxTable, dedent } from '../shared/utils.js'

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    workingDir: { type: 'string', description: 'レビュー対象の作業ディレクトリ' },
  },
  required: ['workingDir'],
} as const satisfies Schema

const SOURCES = ['lint', '型チェック', 'Tailwind', 'パターン集', '実装指針', 'code-review'] as const
const SEVERITIES = ['must', 'should', 'nit'] as const
const SEVERITY_ICONS: Record<string, string> = { must: '❌', should: '⚠', nit: '💭' }

const ITEMS_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        enum: SOURCES,
        description: 'この指摘がどのチェック由来か',
      },
      severity: {
        type: 'string',
        enum: SEVERITIES,
        description: dedent`
          must: バグ・型エラー・パターン集や指針の must 違反
          should: 直した方が明確に良いもの・指針の should 違反
          nit: 書き方の好みにとどまるもの・指針の nit 違反
          実装指針由来の指摘は指針が置かれているレベル見出しを、
          パターン集由来の指摘は項目見出し末尾の [must]/[should]/[nit] を、それぞれそのまま使う
        `,
      },
      title: {
        type: 'string',
        description:
          '指摘の見出し。パターン違反なら "[3-2] any の使用禁止" のようにカテゴリ番号-項目番号を先頭に付ける',
      },
      file: { type: 'string', description: '対象ファイルのパス' },
      line: { type: ['integer', 'null'], description: '対象行。特定できなければ null' },
      problem: { type: 'string', description: '何が問題かを1行で' },
      fix: { type: 'string', description: '具体的にどう直すか' },
    },
    required: ['source', 'severity', 'title', 'file', 'line', 'problem', 'fix'],
  },
  description: '指摘一覧（1件も無ければ空配列）',
} as const satisfies Schema

const CHECK_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    clean: { type: 'boolean', description: '問題が一切ないかどうか' },
    findings: {
      type: ['string', 'null'],
      description: 'string: clean が false の場合の整形済みレビュー結果, null: clean が true の場合',
    },
    items: ITEMS_SCHEMA,
  },
  required: ['clean', 'findings', 'items'],
} as const satisfies Schema

export function reviewDiff(workingDir: string): Infer<typeof CHECK_RESULT_SCHEMA> {
  // ─── Phase 1: 前提ファイルの確認 ─────────────────────────────
  phase('前提ファイル確認')

  const sharedDir = gitIsWorktree(workingDir) ? PROJECT_ROOT : workingDir
  const prPatterns = runCommand([`cat ${sharedDir}/${PR_PATTERNS} 2>/dev/null || echo ""`])
  const guidelines = runCommand([`cat ${sharedDir}/${GUIDELINES} 2>/dev/null || echo ""`])

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

  // ─── Phase 8: 指摘の構造化 ───────────────────────────────────
  phase('指摘の構造化')

  const items = complete(
    dedent`
      以下の各チェック結果を、指摘1件につき1要素として構造化してください
      同じ箇所を複数のチェックが指摘している場合は、より具体的な方1件にまとめてください

      lint エラー: ${lintResult || 'なし'}

      型チェック結果（ワークスペースごと）: ${JSON.stringify(typecheckResults)}

      ${TAILWIND_CHECK ? `Tailwind arbitrary value チェック結果: ${tailwindResult}` : 'Tailwind arbitrary value チェック: TAILWIND_CHECK が False のためスキップ'}

      パターン違反候補: ${patternViolations || '(パターン集なし)'}

      指針違反候補: ${guidelineViolations || '(指針なし)'}

      code-review 指摘: ${codeReviewResult}
    `,
    ITEMS_SCHEMA,
  )

  // ─── Phase 9: 出力フォーマットへの整形 ───────────────────────
  phase('出力フォーマットへの整形')

  if (items.length === 0) return { clean: true, findings: null, items }

  const countOf = (source: string, severity: string) =>
    items.filter((i) => i.source === source && i.severity === severity).length
  const totalOf = (severity: string) => items.filter((i) => i.severity === severity).length

  const usedSources = SOURCES.filter((source) => items.some((i) => i.source === source))

  const summaryTable = boxTable(
    ['出所', ...SEVERITIES, '計'],
    [
      ...usedSources.map((source) => [
        source,
        ...SEVERITIES.map((severity) => `${countOf(source, severity)}`),
        `${items.filter((i) => i.source === source).length}`,
      ]),
      ['合計', ...SEVERITIES.map((severity) => `${totalOf(severity)}`), `${items.length}`],
    ],
    [usedSources.length],
  )

  const section = (severity: string) => {
    const target = items.filter((i) => i.severity === severity)
    if (target.length === 0) return ''

    return dedent`
      ### ${severity}

      ${target
        .map((i) =>
          dedent`
            ${SEVERITY_ICONS[severity]} [${i.source}] ${i.title}
              ${i.file}${i.line ? `:${i.line}` : ''}
              問題: ${i.problem}
              修正案: ${i.fix}
          `,
        )
        .join('\n\n')}
    `
  }

  const blocking = totalOf('must') + totalOf('should')

  return {
    clean: blocking === 0,
    findings: dedent`
      ## レビュー結果 ${blocking === 0 ? `✅ must/should なし（nit ${totalOf('nit')}件）` : `❌ ${items.length}件の指摘`}

      ${summaryTable}

      ${SEVERITIES.map((severity) => section(severity))
        .filter(Boolean)
        .join('\n\n')}
    `,
    items,
  }
}

respond(reviewDiff(getArgs(ARGS_SCHEMA).workingDir))

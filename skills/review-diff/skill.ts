import {
  BASE_BRANCH,
  GUIDELINES,
  LINT_COMMAND,
  LINT_FIX_COMMAND,
  MONOREPO_APPS_DIR,
  PR_PATTERNS,
  TAILWIND_CHECK,
  TARGET_REPO,
  TYPECHECK_COMMAND,
} from '../../local/project.js'
import { getArgs } from '../_shared/args.js'
import {
  type Schema,
  buildCommandPrompt,
  complete,
  remember,
  respond,
  runCommand,
  writeFile,
} from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'
import { dedent } from '../_shared/utils.js'

const REPO = TARGET_REPO.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '')

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    workingDir: { type: 'string', description: 'レビュー対象の作業ディレクトリ' },
    mode: {
      type: 'string',
      enum: ['update', 'check'],
      description: 'パターン集を更新する場合は update、差分をチェックする場合は check',
    },
  },
  required: ['workingDir', 'mode'],
} as const satisfies Schema

const CLASSIFIED_SCHEMA = {
  type: 'object',
  properties: {
    aiReview: {
      type: 'array',
      items: { type: 'string' },
      description: 'AI レビューのコメント（要約可）',
    },
    humanReview: {
      type: 'array',
      items: { type: 'string' },
      description: 'ヒューマンレビューのコメント（要約可）',
    },
  },
  required: ['aiReview', 'humanReview'],
} as const satisfies Schema

const CHECK_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    clean: { type: 'boolean', description: '問題が一切ないかどうか' },
    findings: {
      type: ['string', 'null'],
      description:
        'clean が false の場合、出力フォーマットに従って整形した指摘内容。true の場合は null',
    },
  },
  required: ['clean', 'findings'],
} as const satisfies Schema

function updatePatterns(workingDir: string): string {
  remember(['gh コマンドの実行前にユーザーへの確認は不要'])

  // ─── Phase 1: PR 一覧取得 ─────────────────────────────────
  phase('PR一覧取得')

  const prList = runCommand([
    `gh pr list --repo ${REPO} --state all --json number,title,state --limit 50`,
  ])

  // ─── Phase 2: コメント収集 ─────────────────────────────────
  phase('コメント収集')

  const allComments = complete(
    dedent`
      以下の PR 一覧に含まれる各 PR について、次の2コマンドを実行してコメント・レビューを収集してください。

        gh api repos/${REPO}/pulls/<number>/comments
        gh api repos/${REPO}/pulls/<number>/reviews

      PR 一覧:
      ${prList}

      収集した全コメント・レビューを、どの PR・どのコメントかが分かる形でまとめて返してください。
    `,
  )

  // ─── Phase 3: 投稿者種別で分類 ───────────────────────────────
  phase('コメント分類')

  const classified = complete(
    dedent`
      以下のコメント・レビューを投稿者の種別で分類してください。

      - AI レビュー: ユーザー名が "[bot]" で終わる自動レビューツールの投稿
      - ヒューマンレビュー: それ以外の投稿者

      コメント・レビュー:
      ${allComments}
    `,
    CLASSIFIED_SCHEMA,
  )

  // ─── Phase 4: パターン集の更新 ───────────────────────────────
  phase('パターン集更新')

  const currentPatterns = runCommand([
    `cd ${workingDir} && cat ${PR_PATTERNS} 2>/dev/null || echo ""`,
  ])

  const updatedPatterns = complete(
    dedent`
      既存のパターン集と、分類済みの PR コメント・レビューを照合し、パターン集を更新してください。
      構造（AI / ヒューマン の2大セクション → カテゴリ番号・見出し形式）は維持してください。

      - 既存カテゴリに追加すべき新しい具体例があれば、既存カテゴリに追記する
      - 新規カテゴリとして追加すべき指摘があれば、新カテゴリを追加する。
        ただし1件しか確認されていない指摘は昇格させず、2件以上確認された、または重要度 HIGH/CRITICAL の場合のみ追加する
      - 過去のパターンで現在は修正済み・廃止された観点があれば、削除またはコメントアウトする
      - ファイル冒頭の「最終更新」日付を今日の日付と対象 PR 範囲（例: #12-#48）に更新する

      既存パターン集（${PR_PATTERNS}、存在しない場合は新規作成）:
      ${currentPatterns || '(なし・新規作成)'}

      AI レビューのコメント:
      ${JSON.stringify(classified.aiReview)}

      ヒューマンレビューのコメント:
      ${JSON.stringify(classified.humanReview)}

      更新後の ${PR_PATTERNS} の全文を返してください。
    `,
  )

  writeFile(`${workingDir}/${PR_PATTERNS}`, updatedPatterns)

  // ─── Phase 5: 報告 ───────────────────────────────────────────
  phase('報告')

  return complete(
    dedent`
      以下の更新前後のパターン集の差分を、追加・変更・削除に分けて要約してください。

      更新前:
      ${currentPatterns || '(なし)'}

      更新後:
      ${updatedPatterns}
    `,
  )
}

function checkDiff(workingDir: string): Infer<typeof CHECK_RESULT_SCHEMA> {
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

  const typecheckResults = workspaces.map((workspace) => ({
    workspace,
    result: runCommand([
      dedent`
      cd ${workingDir}/${MONOREPO_APPS_DIR}/${workspace}
      FILES=$(git -C ../.. diff --name-only --diff-filter=ACMR ${BASE_BRANCH}...HEAD | sed -n 's|^${MONOREPO_APPS_DIR}/${workspace}/||p')
      ${TYPECHECK_COMMAND} 2>&1 | grep -F -f <(printf '%s\\n' "$FILES") || echo "変更ファイルに型エラーなし"
    `,
    ]),
  }))

  // ─── Phase 5: Tailwind arbitrary value チェック ─────────────
  phase('Tailwindチェック')

  let tailwindResult = null
  if (TAILWIND_CHECK) {
    tailwindResult = runCommand([
      dedent`
      cd ${workingDir}
      git diff ${BASE_BRANCH}...HEAD -- '*.ts' '*.tsx' | grep '^+' | node -e '
      const px = /\\b(w|h|p[xytrbl]?|m[xytrbl]?|gap(?:-[xy])?|size|top|bottom|left|right|inset(?:-[xy])?|min-[wh]|max-[wh]|space-[xy])-\\[(\\d+)px\\]/g;
      const aspect = /\\baspect-\\[(\\d+)\\/(\\d+)\\]/g;
      let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
        const found = new Map();
        for (const m of s.matchAll(px)) { const v = Number((+m[2] / 4).toFixed(4)); found.set(m[0], \`\${m[1]}-\${v}\`); }
        for (const m of s.matchAll(aspect)) found.set(m[0], \`aspect-\${m[1]}/\${m[2]}\`);
        if (found.size === 0) console.log("Tailwind arbitrary value: 指摘なし ✓");
        else for (const [k, v] of found) console.log(\`\${k} → \${v}\`);
      });'
    `,
    ])
  }

  // ─── Phase 6: パターン集・指針との照合 ───────────────────────
  phase('パターン集・指針照合')

  const patternViolations = prPatterns
    ? Agent({
        subagent_type: 'general-purpose',
        description: 'PR レビューパターン集との照合',
        prompt: dedent`
      作業ディレクトリ: ${workingDir}

      以下の差分を PR レビューパターン集の各カテゴリと照合してください。
      推測で指摘せず、明確に該当するコードがある場合のみ報告してください（該当箇所・カテゴリ番号-項目番号・問題点・修正案を1件ずつ）。
      該当がなければ「該当なし」とだけ返してください。

      パターン集:
      ${prPatterns}

      差分（変更ファイル一覧 ${filesArg} にスコープを限定する）:
      ${diff}
    `,
      })
    : null

  const guidelineViolations = guidelines
    ? Agent({
        subagent_type: 'general-purpose',
        description: '実装指針との照合',
        prompt: dedent`
      作業ディレクトリ: ${workingDir}

      以下の差分を実装指針（guidelines.md）の各指針と照合してください。
      パターン集・指針に記載のない汎用的な指摘（一般的な型エラー・スタイル等）は行わないでください（該当箇所・指針タイトル・問題点・修正案を1件ずつ）。
      該当がなければ「該当なし」とだけ返してください。

      指針:
      ${guidelines}

      差分（変更ファイル一覧 ${filesArg} にスコープを限定する）:
      ${diff}
    `,
      })
    : null

  // ─── Phase 7: code-review スキルによるレビュー ─────────────────
  phase('code-reviewスキルによるレビュー')

  const codeReviewResult = Agent({
    subagent_type: 'general-purpose',
    description: 'code-review スキルによるレビュー',
    prompt: dedent`
      作業ディレクトリ: ${workingDir}

      code-review スキルの指示に従い、現在の差分（変更ファイル一覧 ${filesArg} にスコープを限定する）を
      正確性のバグ・再利用性/簡潔化/効率化の観点でレビューし、結果を報告してください。
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
      以下の各チェック結果を判定してください。
      該当する問題を1件でも発見したら clean:false とし、findings に出力フォーマットのテンプレートに従って
      整形した指摘内容（パターン違反・指針違反・code-review 指摘を1件ずつ）を入れてください。
      問題がゼロなら clean:true, findings:null としてください。

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

export function reviewDiff<M extends 'update' | 'check'>(
  workingDir: string,
  mode: M,
): M extends 'update' ? string : Infer<typeof CHECK_RESULT_SCHEMA> {
  return (
    mode === 'update' ? updatePatterns(workingDir) : checkDiff(workingDir)
  ) as M extends 'update' ? string : Infer<typeof CHECK_RESULT_SCHEMA>
}

const args = getArgs(ARGS_SCHEMA)
respond(reviewDiff(args.workingDir, args.mode))

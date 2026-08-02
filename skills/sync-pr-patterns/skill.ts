import { PR_PATTERNS } from '../../local/project.js'
import { getArgs } from '../_shared/args.js'
import {
  type Schema,
  complete,
  generate,
  remember,
  respond,
  runCommand,
  writeFile,
} from '../_shared/complete.js'
import { REPO } from '../_shared/git.js'
import type { Infer } from '../_shared/infer.js'
import { dedent } from '../_shared/utils.js'

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    workingDir: { type: 'string', description: 'パターン集を書き込む作業ディレクトリ' },
  },
  required: ['workingDir'],
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

export function syncPrPatterns(args: Infer<typeof ARGS_SCHEMA>): string {
  const { workingDir } = args

  remember(['gh コマンドの実行前にユーザーへの確認は不要'])

  // ─── Phase 1: PR 一覧取得 ─────────────────────────────────
  phase('PR一覧取得')

  const prList = runCommand([
    `gh pr list --repo ${REPO} --state all --json number,title,state --limit 50`,
  ])

  // ─── Phase 2: コメント収集 ─────────────────────────────────
  phase('コメント収集')

  const allComments = generate(
    dedent`
      以下の PR 一覧に含まれる各 PR について、次の2コマンドを実行してコメント・レビューを収集してください

        gh api repos/${REPO}/pulls/<number>/comments
        gh api repos/${REPO}/pulls/<number>/reviews

      PR 一覧:
      ${prList}

      収集した全コメント・レビューを、どの PR・どのコメントかが分かる形でまとめて返してください
    `,
  )

  // ─── Phase 3: 投稿者種別で分類 ───────────────────────────────
  phase('コメント分類')

  const classified = complete(
    dedent`
      以下のコメント・レビューを投稿者の種別で分類してください

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

  const updatedPatterns = generate(
    dedent`
      既存のパターン集と、分類済みの PR コメント・レビューを照合し、パターン集を更新してください
      構造（AI / ヒューマン の2大セクション → カテゴリ番号・見出し形式）は維持してください

      - 既存カテゴリに追加すべき新しい具体例があれば、既存カテゴリに追記する
      - 新規カテゴリとして追加すべき指摘があれば、新カテゴリを追加する
        ただし1件しか確認されていない指摘は昇格させず、2件以上確認された、または重要度 HIGH/CRITICAL の場合のみ追加する
      - 過去のパターンで現在は修正済み・廃止された観点があれば、削除またはコメントアウトする
      - ファイル冒頭の「最終更新」日付を今日の日付と対象 PR 範囲（例: #12-#48）に更新する

      既存パターン集（${PR_PATTERNS}、存在しない場合は新規作成）:
      ${currentPatterns || '(なし・新規作成)'}

      AI レビューのコメント:
      ${JSON.stringify(classified.aiReview)}

      ヒューマンレビューのコメント:
      ${JSON.stringify(classified.humanReview)}

      更新後の ${PR_PATTERNS} の全文を返してください
    `,
  )

  writeFile(`${workingDir}/${PR_PATTERNS}`, updatedPatterns)

  // ─── Phase 5: 報告 ───────────────────────────────────────────
  phase('報告')

  return generate(
    dedent`
      以下の更新前後のパターン集の差分を、追加・変更・削除に分けて要約してください

      更新前:
      ${currentPatterns || '(なし)'}

      更新後:
      ${updatedPatterns}
    `,
  )
}

respond(syncPrPatterns(getArgs(ARGS_SCHEMA)))

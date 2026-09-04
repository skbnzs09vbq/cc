import { PR_PATTERNS, PROJECT_ROOT } from '../../local/project.js'
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
import { REPO, gitIsWorktree } from '../_shared/git.js'
import type { Infer } from '../_shared/infer.js'
import { dedent } from '../_shared/utils.js'

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    workingDir: { type: 'string', description: 'パターン集を書き込む作業ディレクトリ' },
  },
  required: ['workingDir'],
} as const satisfies Schema

const LEVEL_CRITERIA = dedent`
  - must: 守らないとバグ・事故・レビュー差し戻しになるもの（指摘が繰り返されている、重要度 HIGH/CRITICAL のもの）
  - should: 直した方が明確に良いが、状況によっては外してよいもの
  - nit: 書き方の好みにとどまるもの（レビューで "nit" と添えられていたもの含む）
`

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

  const patternsPath = gitIsWorktree(workingDir)
    ? `${PROJECT_ROOT}/${PR_PATTERNS}`
    : `${workingDir}/${PR_PATTERNS}`
  const currentPatterns = runCommand([`cat ${patternsPath} 2>/dev/null || echo ""`])

  const updatedPatterns = generate(
    dedent`
      既存のパターン集と、分類済みの PR コメント・レビューを照合し、パターン集を更新してください
      構造（AI / ヒューマン の2大セクション → カテゴリ番号・見出し形式）は維持してください

      ## マージ方針

      新規追加より既存への統合を優先する。項目の総数はできるだけ増やさない

      - 新しい指摘は、まず既存カテゴリの項目に取り込めないかを検討する。趣旨が重なるもの・既存項目の
        具体例に過ぎないものは、独立した項目にせず既存側に統合するか捨てる
      - 既存項目を少し広げれば新しい指摘も包含できる場合は、既存の文言を汎用化して1本にまとめる
      - 新規カテゴリ・新規項目として独立させるのは、既存のどれにも含められない観点が現れた場合だけにする
        ただし1件しか確認されていない指摘は昇格させず、2件以上確認された、または重要度 HIGH/CRITICAL の場合のみ追加する
      - 過去のパターンで現在は修正済み・廃止された観点があれば削除する

      ## 文言の方針

      項目は「どんな場面にも当てはまる原則」として書く。特定の PR の記録にしない

      - シチュエーションを詳しく書かない。指摘が出た PR 番号・ファイル名・関数名・やり取りの経緯は
        書かず、そこから抽出した原則だけを書く
      - 既存の文言も対象にする。冗長な説明・重複する言い回し・具体例の列挙が含まれていれば、
        意味を変えない範囲で短く書き直す
      - 似た項目どうしで語彙・言い回しが揃っていなければ統一する（同じ概念を別の言葉で書かない）
      - 1項目は1〜2文。それ以上必要なら、原則の抽出が足りていないか、2つの項目が混ざっている

      ## レベル付与

      各項目の見出し末尾に [must] / [should] / [nit] を付ける（例: "### 3-2 any の使用を避ける [must]"）
      ${LEVEL_CRITERIA}
      既存項目にレベルが無い場合も、内容から同じ基準で振り分ける

      ## その他

      - ファイル冒頭の「最終更新」日付を今日の日付と対象 PR 範囲（例: #12-#48）に更新する

      既存パターン集（${patternsPath}、存在しない場合は新規作成）:
      ${currentPatterns || '(なし・新規作成)'}

      AI レビューのコメント:
      ${JSON.stringify(classified.aiReview)}

      ヒューマンレビューのコメント:
      ${JSON.stringify(classified.humanReview)}

      更新後の全文を返してください
    `,
  )

  writeFile(patternsPath, updatedPatterns)

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

import { TARGET_REPO } from '../../local/project.js'
import { gitPrCommentsList } from '../git-pr-comments-list/skill.js'
import { implement } from '../implement/skill.js'
import { getArgs } from '../_shared/args.js'
import {
  type Schema,
  askUser,
  complete,
  generate,
  remember,
  respond,
  runCommand,
} from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'
import { dedent } from '../_shared/utils.js'

const REPO = TARGET_REPO.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '')

const REVIEW_ITEM_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: {
        type: ['number', 'null'],
        description: 'レビューコメント側の id\nレビュー本文由来など id が無いものは null',
      },
      file: { type: ['string', 'null'], description: '対象ファイルパス\n無ければ null' },
      line: { type: ['string', 'number', 'null'], description: '対象行\n無ければ null' },
      original: { type: 'string', description: '指摘の原文' },
      summary: { type: 'string', description: '指摘内容の要約' },
      validity: {
        type: 'string',
        description: '指摘の妥当性についての評価（妥当・要検討・的外れ等、理由も添えて）',
      },
    },
    required: ['id', 'file', 'line', 'original', 'summary', 'validity'],
  },
} as const satisfies Schema

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    workingDir: {
      type: ['string', 'null'],
      description: '対応を行う作業ディレクトリ\n未指定ならカレントディレクトリ',
    },
    url: { type: ['string', 'null'], description: '対象の GitHub PR URL\n無ければ null' },
    autonomous: {
      type: 'boolean',
      description: 'workflow 等からの無人実行なら true\nユーザーが直接呼んだ場合は false',
    },
  },
  required: ['workingDir', 'url', 'autonomous'],
} as const satisfies Schema

export function gitPrResolveComments(args: Infer<typeof ARGS_SCHEMA>): string {
  const { autonomous } = args
  const workingDir = args.workingDir ?? '.'
  remember(['git commit・git push・PR 作成は絶対に行わないこと'])

  // ─── Phase 1: 指摘収集 ─────────────────────────────────────
  phase('指摘収集')

  const input = args.url || askUser('対象の GitHub PR URL を教えてください')

  const prNumber = generate(`"${input}" から PR 番号を抽出してください`)

  const reviewComments = gitPrCommentsList({ prNumber: Number(prNumber) })
  const reviews = runCommand([
    `gh api repos/${REPO}/pulls/${prNumber}/reviews --jq '.[] | select(.body != "") | {user: .user.login, state: .state, body: .body}'`,
  ])

  // ─── Phase 2: カテゴリ分け・提示 ───────────────────────────
  phase('カテゴリ分け・提示')

  const items = complete(
    dedent`
      以下のレビューコメント・レビュー本文それぞれについて、id・原文・内容の要約・妥当性の評価を抽出してください
      id はレビューコメント側にのみ含まれる元の id をそのまま使う（レビュー本文由来の項目は null）

      レビューコメント:
      ${reviewComments}

      レビュー本文:
      ${reviews}
    `,
    REVIEW_ITEM_SCHEMA,
  )

  type ReviewItem = (typeof items)[number]

  const itemText = (item: ReviewItem, i: number) => dedent`
    ### ${i + 1}. ${item.file ? `${item.file}${item.line ? `:${item.line}` : ''}` : '(ファイル指定なし)'}
    - 原文: ${item.original}
    - 要約: ${item.summary}
    - 妥当性: ${item.validity}
  `

  respond(dedent`
    ## PR #${prNumber} 指摘事項一覧

    ${items.map(itemText).join('\n\n')}
  `)

  // ─── Phase 3: 対応方針の確認 ─────────────────────────────────
  phase('対応方針の確認')

  const mode = autonomous
    ? 2
    : askUser(
        dedent`
      上記の指摘にどう対応しますか？

      1. 1件ずつ対応する（1件ごとに次へ進むか確認する）
      2. 不要な項目を番号で除外して、まとめて対応する
    `,
        { type: 'number', enum: [1, 2] } as const,
      )

  // ─── Phase 4: 実装への委譲 ────────────────────────────────────
  phase('実装への委譲')

  let addressedItems: ReviewItem[]

  if (mode === 2) {
    const excludeNumbers = autonomous
      ? []
      : askUser('対応しない項目の番号を教えてください（無ければ空配列で回答してください）', {
          type: 'array',
          items: { type: 'number' },
          description: '除外する項目の番号一覧',
        } as const)

    addressedItems = items.filter((_, i) => !excludeNumbers.includes(i + 1))
    implement({ workingDir, input: addressedItems.map(itemText).join('\n\n') })

    for (const item of addressedItems) {
      if (item.id)
        runCommand([
          `gh api repos/${REPO}/pulls/comments/${item.id}/reactions -f content='+1' >/dev/null 2>&1 || true`,
        ])
    }
  } else {
    addressedItems = items

    for (let i = 0; i < items.length; i++) {
      let text = itemText(items[i], i)
      let proceed = false

      while (!proceed) {
        implement({ workingDir, input: text })

        if (items[i].id)
          runCommand([
            `gh api repos/${REPO}/pulls/comments/${items[i].id}/reactions -f content='+1' >/dev/null 2>&1 || true`,
          ])

        if (i === items.length - 1) {
          proceed = true
          break
        }

        const next = askUser(
          `項目 ${i + 1} の対応が完了しました\n次の項目（${i + 2}）に進みますか？（いいえの場合、この項目への追加指示を聞きます）`,
          { type: 'boolean' } as const,
        )

        if (next) {
          proceed = true
        } else {
          const feedback = askUser(
            `項目 ${i + 1} について追加で対応してほしい内容を教えてください`,
          )
          text = `${text}\n\n追加指示:\n${feedback}`
        }
      }
    }
  }

  return dedent`
    PR #${prNumber} の指摘 ${addressedItems.length} 件に対応しました

    ${addressedItems.map((item) => `- ${item.summary}`).join('\n')}
  `
}

respond(gitPrResolveComments(getArgs(ARGS_SCHEMA)))

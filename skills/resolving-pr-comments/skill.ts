import { dedent } from '../_shared/utils.js'
import { complete, generate, runCommand, remember, askUser, respond, Schema } from '../_shared/complete.js'
import { getArgs } from '../_shared/args.js'
import { TARGET_REPO } from '../../local/project.js'

remember(['git commit・git push・PR 作成は絶対に行わないこと'])

// ─── Phase 1: 指摘収集 ─────────────────────────────────────
phase('指摘収集')

const ARGS_SCHEMA: Schema = {
  type: 'object',
  properties: {
    url: { type: ['string', 'null'], description: '対象の GitHub PR URL。無ければ null' },
    autonomous: { type: 'boolean', description: 'workflow 等からの無人実行なら true。ユーザーが直接呼んだ場合は false' },
  },
  required: ['url', 'autonomous'],
}

const { url, autonomous } = getArgs<{ url: string | null, autonomous: boolean }>(ARGS_SCHEMA)
const input = url || askUser('対象の GitHub PR URL を教えてください。')

const prNumber = generate(`"${input}" から PR 番号を抽出してください。`)

const reviewComments = runCommand([
  `gh api repos/${TARGET_REPO}/pulls/${prNumber}/comments --jq '.[] | {user: .user.login, body: .body, path: .path, line: .original_line}'`,
])
const reviews = runCommand([
  `gh api repos/${TARGET_REPO}/pulls/${prNumber}/reviews --jq '.[] | select(.body != "") | {user: .user.login, state: .state, body: .body}'`,
])

// ─── Phase 2: カテゴリ分け・提示 ───────────────────────────
phase('カテゴリ分け・提示')

const REVIEW_ITEM_SCHEMA: Schema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      file: { type: ['string', 'null'], description: '対象ファイルパス。無ければ null' },
      line: { type: ['string', 'number', 'null'], description: '対象行。無ければ null' },
      original: { type: 'string', description: '指摘の原文' },
      summary: { type: 'string', description: '指摘内容の要約' },
      validity: { type: 'string', description: '指摘の妥当性についての評価（妥当・要検討・的外れ等、理由も添えて）' },
    },
    required: ['file', 'line', 'original', 'summary', 'validity'],
  },
}

const items = complete(
  dedent`
    以下のレビューコメント・レビュー本文それぞれについて、原文・内容の要約・妥当性の評価を抽出してください。

    レビューコメント:
    ${reviewComments}

    レビュー本文:
    ${reviews}
  `,
  REVIEW_ITEM_SCHEMA
)

type ReviewItem = { file: string | null, line: string | number | null, original: string, summary: string, validity: string }

const itemText = (item: ReviewItem, i: number) => dedent`
  ### ${i + 1}. ${item.file ? `${item.file}${item.line ? ':' + item.line : ''}` : '(ファイル指定なし)'}
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

const mode = autonomous ? 2 : askUser<number>(
  dedent`
    上記の指摘にどう対応しますか？

    1. 1件ずつ対応する（1件ごとに次へ進むか確認する）
    2. 不要な項目を番号で除外して、まとめて対応する
  `,
  { type: 'number', enum: [1, 2] }
)

// ─── Phase 4: 実装への委譲 ────────────────────────────────────
phase('実装への委譲')

if (mode === 2) {
  const excludeNumbers = autonomous ? [] : askUser<number[]>(
    '対応しない項目の番号を教えてください（無ければ空配列で回答してください）。',
    { type: 'array', items: { type: 'number' }, description: '除外する項目の番号一覧' }
  )

  const targetItems = items.filter((_: ReviewItem, i: number) => !excludeNumbers.includes(i + 1))
  Skill("implement", targetItems.map(itemText).join('\n\n'))
} else {
  for (let i = 0; i < items.length; i++) {
    let text = itemText(items[i], i)
    let proceed = false

    while (!proceed) {
      Skill("implement", text)

      if (i === items.length - 1) {
        proceed = true
        break
      }

      const next = askUser<boolean>(
        `項目 ${i + 1} の対応が完了しました。次の項目（${i + 2}）に進みますか？（いいえの場合、この項目への追加指示を聞きます）`,
        { type: 'boolean' }
      )

      if (next) {
        proceed = true
      } else {
        const feedback = askUser(`項目 ${i + 1} について追加で対応してほしい内容を教えてください。`)
        text = `${text}\n\n追加指示:\n${feedback}`
      }
    }
  }
}

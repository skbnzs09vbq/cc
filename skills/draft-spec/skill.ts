import { BASE_BRANCH } from '../../local/project.js'
import { getArgs } from '../_shared/args.js'
import { type Schema, complete, respond, runCommand } from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'
import { dedent } from '../_shared/utils.js'

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    workingDir: {
      type: ['string', 'null'],
      description: 'string: 対象ブランチがある作業ディレクトリ, null: 未指定（カレントディレクトリ）',
    },
    supplement: {
      type: ['string', 'null'],
      description: 'string: issue 情報など、差分だけでは分からない補足, null: なし',
    },
  },
  required: ['workingDir', 'supplement'],
} as const satisfies Schema

export const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: '対象（画面名・機能名・エンドポイント等）。同じ対象の項目は同じ表記で揃える',
          },
          spec: {
            type: 'string',
            description: 'その対象がどうなったかを1文で。利用者から見た振る舞いで書く',
          },
        },
        required: ['target', 'spec'],
      },
      description: '仕様ベースの対応内容。target が同じものは隣り合うように並べる',
    },
    internal: {
      type: 'array',
      items: { type: 'string' },
      description:
        '利用者から見た振る舞いが変わらない変更（リファクタ・依存更新・型整理等）。無ければ空配列',
    },
    markdown: { type: 'string', description: '箇条書きに整形した本文' },
  },
  required: ['items', 'internal', 'markdown'],
} as const satisfies Schema

const SPEC_SCHEMA = {
  type: 'object',
  properties: {
    items: RESULT_SCHEMA.properties.items,
    internal: RESULT_SCHEMA.properties.internal,
  },
  required: ['items', 'internal'],
} as const satisfies Schema

export function draftSpec(args: Infer<typeof ARGS_SCHEMA>): Infer<typeof RESULT_SCHEMA> {
  const workingDir = args.workingDir ?? '.'
  const { supplement } = args

  // ─── Phase 1: 差分取得 ─────────────────────────────────────
  phase('差分取得')

  const log = runCommand([`cd ${workingDir} && git log ${BASE_BRANCH}..HEAD --oneline`])
  const diffStat = runCommand([`cd ${workingDir} && git diff ${BASE_BRANCH}...HEAD --stat`])
  const diff = runCommand([
    `cd ${workingDir} && git diff ${BASE_BRANCH}...HEAD -- . ':!.claude' ':!*.lock' ':!*-lock.json'`,
  ])

  // ─── Phase 2: 仕様の抽出 ───────────────────────────────────
  phase('仕様の抽出')

  const extracted = complete(
    dedent`
      以下のブランチの差分から、このブランチで対応した内容を仕様として洗い出してください

      ## 書き方

      実装ではなく仕様を書く。コードを読まない人が読んで、何ができるようになったかが分かる粒度にする

      - 「どう実装したか」ではなく「利用者から見て何がどうなったか」を書く
        悪い例: useMemo でフィルタ結果をキャッシュするようにした
        良い例: 一覧の絞り込み時に画面がちらつかなくなった
      - 関数名・コンポーネント名・ファイル名・ライブラリ名は出さない。ただし画面名・項目名・
        エンドポイントなど、利用者や仕様書に現れる名前は出してよい
      - 1項目1文。「〜できるようになった」「〜が表示されるようになった」「〜される」の形にする
      - 条件・制約があれば省略せずその文に含める（例: 未入力の場合はエラーを表示する）
      - 網羅性を優先し、差分から読み取れる仕様上の変化はすべて挙げる。まとめすぎて情報を落とさない
      - 利用者から見た振る舞いが変わらない変更は items ではなく internal に入れる

      ## コミットログ
      ${log}

      ## 差分概要
      ${diffStat}

      ## 差分
      ${diff}

      ${supplement ? `## 補足（差分との整合性を確認したうえで反映する）\n${supplement}` : ''}
    `,
    SPEC_SCHEMA,
  )

  // ─── Phase 3: 整形 ─────────────────────────────────────────
  phase('整形')

  const grouped = [...new Set(extracted.items.map((i) => i.target))].map((target) => {
    const specs = extracted.items.filter((i) => i.target === target)
    return specs.length === 1
      ? `- ${target}: ${specs[0].spec}`
      : `- ${target}\n${specs.map((s) => `  - ${s.spec}`).join('\n')}`
  })

  const internalSection = extracted.internal.length
    ? `\n\n### 内部変更\n\n${extracted.internal.map((t) => `- ${t}`).join('\n')}`
    : ''

  return {
    ...extracted,
    markdown: `${grouped.join('\n')}${internalSection}`,
  }
}

respond(draftSpec(getArgs(ARGS_SCHEMA)).markdown)

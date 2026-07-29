import { RESEARCH_SOURCES } from '../../local/project.js'
import { parseArgs } from '../_shared/args.js'
import { type Schema, askUser, complete, generate, remember, respond } from '../_shared/complete.js'
import { dedent } from '../_shared/utils.js'

remember([
  '書き込み・投稿・編集は一切行わず、読み取りのみ行うこと。write 系 MCP ツールは使用禁止',
  'row.type に対応する MCP ツールが接続されていない・見つからない場合は、その旨を result に含めて次のソースに進む（調査全体を中断しない）',
])

const OUTPUT_FORMAT = dedent`
  ## 調査テーマ: {テーマ}

  ### {ソース1のタイトル}
  {関連情報の要点。Slack の場合は日時・投稿者も記載。なければ「関連情報なし」}

  ### {ソース2のタイトル}
  {関連情報の要点。なければ「関連情報なし」}

  ### まとめ
  {全ソースを横断して分かったこと・未解決の点を簡潔にまとめる}
`

// ─── Phase 1: テーマ確認 ─────────────────────────────────────
phase('テーマ確認')

const input = parseArgs() || askUser('調査テーマを教えてください。')

// ─── Phase 2: ソース別調査 ────────────────────────────────────
phase('ソース別調査')

const FINDING_SCHEMA: Schema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      type: { type: 'string' },
      value: { type: 'string' },
      label: { type: ['string', 'null'] },
      result: {
        type: ['string', 'null'],
        description: '検索・取得結果。対応するツールが見つからない・取得できない場合は null',
      },
    },
    required: ['type', 'value', 'label', 'result'],
  },
}

const findings = complete(
  dedent`
    以下の各ソースについて、type に対応する読み取り専用の MCP ツールを ToolSearch で探し、
    value を対象に "${input}" に関連する内容を検索・取得してください。
    取得結果の内容が不十分で、詳細を確認すべき参照（スレッド・ページ・Issue の URL や ID など）が
    見つかる場合は、その参照について改めてツールを呼び出し、詳細を取得してください。

    ソース一覧:
    ${JSON.stringify(RESEARCH_SOURCES)}
  `,
  FINDING_SCHEMA,
)

// ─── Phase 3: 出力フォーマットへの整形 ────────────────────────
phase('出力フォーマットへの整形')

const output = generate(
  dedent`
    以下の調査結果を、ソース別サマリー形式に整形してください。

    調査テーマ: ${input}

    ソース別結果:
    ${JSON.stringify(findings)}

    RESEARCH_SOURCES の各行に対してセクションを1つ出力する。セクションタイトルは
    "### <種別> <値の説明>" とする（label があれば使う）。最後に全ソースを横断した
    "### まとめ" セクションを追加する。

    出力フォーマット:
    ${OUTPUT_FORMAT}
  `,
)

respond(output)

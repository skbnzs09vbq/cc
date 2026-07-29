import { BRANCH_FORMAT, TICKET_PREFIX, TYPES } from '../../local/project.js'
import { parseArgs } from '../_shared/args.js'
import { type Schema, askUser, complete, remember, respond } from '../_shared/complete.js'
import { dedent } from '../_shared/utils.js'

remember(['git switch / git branch は実行しないこと'])

// ─── Phase 1: 入力取得 ─────────────────────────────────────
phase('入力取得')

const input = parseArgs() || askUser('作業内容を教えてください。')

// ─── Phase 2: 候補生成 ─────────────────────────────────────
phase('候補生成')

const ANGLES = ['concise', 'descriptive']

const CANDIDATE_SCHEMA: Schema = {
  type: 'object',
  properties: {
    branchName: {
      type: 'string',
      description: `ブランチ名の形式 "${BRANCH_FORMAT}" のプレースホルダをすべて埋めた、実際に使えるブランチ名`,
    },
  },
  required: ['branchName'],
}

const candidates = ANGLES.map(
  (angle) =>
    complete(
      dedent`
    以下の作業内容から、"${angle}" の切り口でブランチ名を1つ生成してください。

    ブランチ名の形式: "${BRANCH_FORMAT}"
    {type} を使う場合の選択肢: ${TYPES.join(' / ')}
    TICKET_PREFIX: ${TICKET_PREFIX}

    作業内容:
    ${input}
  `,
      CANDIDATE_SCHEMA,
    ).branchName,
)

// ─── Phase 3: 出力の整形 ─────────────────────────────────
phase('出力の整形')

const output = candidates.map((line: string, i: number) => `${i + 1}. ${line}`).join('\n')

respond(output)

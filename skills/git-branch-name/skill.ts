import { BRANCH_FORMAT, TICKET_PREFIX, TYPES } from '../../local/project.js'
import { getArgs } from '../_shared/args.js'
import { type Schema, askUser, complete, remember, respond } from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'
import { dedent } from '../_shared/utils.js'

const ANGLES = ['concise', 'descriptive']

const CANDIDATE_SCHEMA = {
  type: 'object',
  properties: {
    branchName: {
      type: 'string',
      description: `ブランチ名の形式 "${BRANCH_FORMAT}" のプレースホルダをすべて埋めた、実際に使えるブランチ名`,
    },
  },
  required: ['branchName'],
} as const satisfies Schema

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    workDescription: {
      type: ['string', 'null'],
      description: 'string: ブランチ名を決めるための作業内容, null: 無ければユーザーに確認する',
    },
    single: {
      type: ['boolean', 'null'],
      description:
        'boolean: true なら候補を1つに絞って直接返す・false なら複数の候補を提示する, null: 複数の候補を提示する（false と同じ）',
    },
  },
  required: ['workDescription', 'single'],
} as const satisfies Schema

export function gitBranchName(args: Infer<typeof ARGS_SCHEMA>): string {
  const workDescription = args.workDescription ?? askUser('作業内容を教えてください')
  const single = args.single ?? false

  remember(['git switch / git branch は実行しないこと'])

  // ─── Phase 1: 候補生成 ─────────────────────────────────────
  phase('候補生成')

  const angles = single ? [ANGLES[0]] : ANGLES

  const candidates = angles.map(
    (angle) =>
      complete(
        dedent`
          以下の作業内容から、"${angle}" の切り口でブランチ名を1つ生成してください
          作業内容が読み取りにくくても、"chore/add-placeholder" のような作業内容を反映しない汎用名は選ばないこと

          ブランチ名の形式: "${BRANCH_FORMAT}"
          {type} を使う場合の選択肢: ${TYPES.join(' / ')}
          TICKET_PREFIX: ${TICKET_PREFIX}

          作業内容:
          ${workDescription}
        `,
        CANDIDATE_SCHEMA,
      ).branchName,
  )

  if (single) return candidates[0]

  // ─── Phase 2: 出力の整形 ─────────────────────────────────
  phase('出力の整形')

  return candidates.map((line, i) => `${i + 1}. ${line}`).join('\n')
}

respond(gitBranchName(getArgs(ARGS_SCHEMA)))

import { getArgs } from '../_shared/args.js'
import { type Schema, complete, respond } from '../_shared/complete.js'
import { gitPrReviewThreads } from '../_shared/git.js'
import type { Infer } from '../_shared/infer.js'
import { dedent } from '../_shared/utils.js'

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    prNumber: { type: 'integer', description: '対象 PR 番号' },
  },
  required: ['prNumber'],
} as const satisfies Schema

export const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    hasComments: { type: 'boolean', description: 'レビューコメント・スレッドが1件でもあるか' },
    allResolved: {
      type: 'boolean',
      description:
        'hasComments が true の場合、すべて resolved になっているか（false の場合は true）',
    },
  },
  required: ['hasComments', 'allResolved'],
} as const satisfies Schema

export function gitPrReviewStatus(args: Infer<typeof ARGS_SCHEMA>): Infer<typeof RESULT_SCHEMA> {
  const { prNumber } = args

  const threads = gitPrReviewThreads(prNumber, false)

  return complete(
    dedent`
      以下は PR #${prNumber} の reviewThreads 取得結果です

      ${threads}
    `,
    RESULT_SCHEMA,
  )
}

respond(gitPrReviewStatus(getArgs(ARGS_SCHEMA)))

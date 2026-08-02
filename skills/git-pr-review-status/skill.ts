import { getArgs } from '../_shared/args.js'
import { type Schema, respond } from '../_shared/complete.js'
import { gitPrReviewThreads } from '../_shared/git.js'
import type { Infer } from '../_shared/infer.js'

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
        'true: hasComments が true かつ全スレッドが resolved、または hasComments が false の場合, false: hasComments が true かつ未解決のスレッドが残っている場合',
    },
  },
  required: ['hasComments', 'allResolved'],
} as const satisfies Schema

export function gitPrReviewStatus(args: Infer<typeof ARGS_SCHEMA>): Infer<typeof RESULT_SCHEMA> {
  const { prNumber } = args

  const threadsRaw = gitPrReviewThreads(prNumber, false)
  const nodes =
    JSON.parse(threadsRaw || '{}')?.data?.repository?.pullRequest?.reviewThreads?.nodes ?? []

  return {
    hasComments: nodes.length > 0,
    allResolved: nodes.every((n: { isResolved: boolean }) => n.isResolved),
  }
}

respond(gitPrReviewStatus(getArgs(ARGS_SCHEMA)))

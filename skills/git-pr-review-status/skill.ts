import { TARGET_REPO } from '../../local/project.js'
import { getArgs } from '../_shared/args.js'
import { type Schema, complete, respond, runCommand } from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'
import { dedent } from '../_shared/utils.js'

const REPO = TARGET_REPO.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '')
const [OWNER, NAME] = REPO.split('/')

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

  const threads = runCommand([
    dedent`
      gh api graphql -f query='
        query {
          repository(owner: "${OWNER}", name: "${NAME}") {
            pullRequest(number: ${prNumber}) {
              reviewThreads(first: 100) {
                nodes { isResolved }
              }
            }
          }
        }
      '
    `,
  ])

  return complete(
    dedent`
      以下は PR #${prNumber} の reviewThreads 取得結果です
      スレッドが1件も無ければ hasComments:false, allResolved:true としてください
      1件以上あれば hasComments:true とし、すべての isResolved が true なら allResolved:true、
      1件でも false があれば allResolved:false としてください

      ${threads}
    `,
    RESULT_SCHEMA,
  )
}

respond(gitPrReviewStatus(getArgs(ARGS_SCHEMA)))

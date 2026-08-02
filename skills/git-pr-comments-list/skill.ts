import { getArgs } from '../_shared/args.js'
import { type Schema, respond, runCommand } from '../_shared/complete.js'
import { REPO } from '../_shared/git.js'
import type { Infer } from '../_shared/infer.js'

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    prNumber: { type: 'integer', description: '対象 PR 番号' },
  },
  required: ['prNumber'],
} as const satisfies Schema

export function gitPrCommentsList(args: Infer<typeof ARGS_SCHEMA>): string | null {
  const { prNumber } = args
  return runCommand([
    `gh api repos/${REPO}/pulls/${prNumber}/comments --jq '.[] | {id: .id, user: .user.login, body: .body, path: .path, line: .original_line}'`,
  ])
}

respond(gitPrCommentsList(getArgs(ARGS_SCHEMA)))

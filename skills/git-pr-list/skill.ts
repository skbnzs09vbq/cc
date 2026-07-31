import { TARGET_REPO } from '../../local/project.js'
import { getArgs } from '../_shared/args.js'
import { type Schema, respond, runCommand } from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    assignee: {
      type: ['string', 'null'],
      description: 'この GitHub アカウントが作成した PR のみに絞る。未指定なら全体',
    },
  },
  required: ['assignee'],
} as const satisfies Schema

export function gitPrList(args: Infer<typeof ARGS_SCHEMA>): string | null {
  const authorFlag = args.assignee ? `--author ${args.assignee} ` : ''
  return runCommand([
    `gh pr list --repo ${TARGET_REPO} ${authorFlag}--state open --json number,title,url,mergeable`,
  ])
}

respond(gitPrList(getArgs(ARGS_SCHEMA)))

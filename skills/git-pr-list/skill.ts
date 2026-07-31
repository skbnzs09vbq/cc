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
    number: {
      type: ['integer', 'null'],
      description: '指定した場合、この PR 番号1件だけを取得する（assignee・state は無視）',
    },
    state: {
      type: ['string', 'null'],
      enum: ['open', 'closed', 'merged', 'all', null],
      description: 'PR の状態フィルタ。未指定なら open',
    },
  },
  required: ['assignee', 'number', 'state'],
} as const satisfies Schema

export function gitPrList(args: Infer<typeof ARGS_SCHEMA>): string | null {
  if (args.number) {
    return runCommand([
      `gh pr view ${args.number} --repo ${TARGET_REPO} --json number,title,url,mergeable,state`,
    ])
  }

  const authorFlag = args.assignee ? `--author ${args.assignee} ` : ''
  const state = args.state ?? 'open'
  return runCommand([
    `gh pr list --repo ${TARGET_REPO} ${authorFlag}--state ${state} --json number,title,url,mergeable,state`,
  ])
}

respond(gitPrList(getArgs(ARGS_SCHEMA)))

import { getArgs } from '../../_shared/args.js'
import { type Schema, respond, runCommand } from '../../_shared/complete.js'
import type { Infer } from '../../_shared/infer.js'
import { createHerdrTag } from '../create-herdr-tag/skill.js'

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    issueNumber: {
      type: 'integer',
      description: '対象 issue 番号',
    },
    branch: {
      type: ['string', 'null'],
      description:
        'string: worktree がチェックアウトしている既存ブランチ名, null: 新規 issue 対応で named branch がまだ無い場合（detached HEAD のため --path で開く）',
    },
    worktreePath: {
      type: 'string',
      description: 'herdr workspace として開く worktree の絶対パス',
    },
  },
  required: ['issueNumber', 'branch', 'worktreePath'],
} as const satisfies Schema

export const RESULT_SCHEMA = {
  type: 'string',
  description: '起動した herdr agent 名（"t424" 等）',
} as const satisfies Schema

export function openHerdrWorkspace(args: Infer<typeof ARGS_SCHEMA>): Infer<typeof RESULT_SCHEMA> {
  const { issueNumber, branch, worktreePath } = args
  const herdrTag = createHerdrTag({ issueNumber, branch })

  let spaceLabel: string
  let agentPrefix: string
  if (herdrTag === 'REV') {
    spaceLabel = `[REV]-${issueNumber}`
    agentPrefix = 'r'
  } else if (herdrTag === 'PRE') {
    spaceLabel = `[PRE]-${issueNumber}`
    agentPrefix = 'p'
  } else {
    spaceLabel = `${issueNumber}`
    agentPrefix = 't'
  }
  const agentName = `${agentPrefix}${issueNumber}`

  const openArg = branch ? `--branch ${branch}` : `--path ${worktreePath}`
  runCommand([
    `PANE_ID=$(herdr worktree open ${openArg} --label "${spaceLabel}" --no-focus --trust-repository | jq -r '.result.root_pane.pane_id') && herdr agent start ${agentName} --kind claude --pane "$PANE_ID" || true`,
  ])

  return agentName
}

respond(openHerdrWorkspace(getArgs(ARGS_SCHEMA)))

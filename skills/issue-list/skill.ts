import { ASSIGNEE, TARGET_REPO, TASK_TRACKER } from '../../local/project.js'
import { getArgs } from '../_shared/args.js'
import { type Schema, respond, runCommand, runTool } from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    type: {
      type: ['string', 'null'],
      description: 'タスク管理ツールの種類。未指定なら project.ts の TASK_TRACKER を使う',
    },
    assigneeOnly: {
      type: 'boolean',
      description: 'true の場合 project.ts の ASSIGNEE が担当する issue のみに絞る',
    },
  },
  required: ['type', 'assigneeOnly'],
} as const satisfies Schema

export function issueList(args: Infer<typeof ARGS_SCHEMA>): string | null {
  const type = args.type || TASK_TRACKER

  switch (type) {
    case 'github': {
      const assigneeFlag = args.assigneeOnly ? `--assignee ${ASSIGNEE} ` : ''
      return runCommand([
        `gh issue list --repo ${TARGET_REPO} ${assigneeFlag}--state open --json number,url,title,body`,
      ])
    }
    default:
      return runTool(
        `ToolSearch で "${type}" 用の読み取り専用 MCP ツールを探し、open な issue/タスク一覧を取得する${args.assigneeOnly ? '（project.ts の ASSIGNEE 担当分のみに絞る）' : ''}`,
      )
  }
}

respond(issueList(getArgs(ARGS_SCHEMA)))

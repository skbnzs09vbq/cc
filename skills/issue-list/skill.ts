import { ASSIGNEE, TARGET_REPO, TASK_TRACKER } from '../../local/project.js'
import { getArgs } from '../_shared/args.js'
import { type Schema, complete, respond, runCommand } from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'
import { dedent } from '../_shared/utils.js'

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

const ISSUES_SCHEMA = {
  type: 'array',
  items: { type: 'string' },
  description: '各 issue/タスクを1件ごとの説明文にした配列（無ければ空配列）',
} as const satisfies Schema

type RawIssue = { number: number; url: string; title: string; body: string }

export function issueList(args: Infer<typeof ARGS_SCHEMA>): string[] {
  const type = args.type || TASK_TRACKER

  switch (type) {
    case 'github': {
      const assigneeFlag = args.assigneeOnly ? `--assignee ${ASSIGNEE} ` : ''
      const raw = runCommand([
        `gh issue list --repo ${TARGET_REPO} ${assigneeFlag}--state open --json number,url,title,body`,
      ])
      const issues = JSON.parse(raw || '[]') as RawIssue[]
      return issues.map((issue) => `#${issue.number} ${issue.title}: ${issue.body}`)
    }
    default:
      return complete(
        dedent`
          ToolSearch で "${type}" 用の読み取り専用 MCP ツールを探し、open な issue/タスク一覧を取得してください
          ${args.assigneeOnly ? '（project.ts の ASSIGNEE 担当分のみに絞る）' : ''}
        `,
        ISSUES_SCHEMA,
      )
  }
}

respond(issueList(getArgs(ARGS_SCHEMA)))

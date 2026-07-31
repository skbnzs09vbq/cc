import { ASSIGNEE, TARGET_REPO, TASK_TRACKER } from '../../local/project.js'
import { getArgs } from '../_shared/args.js'
import { type Schema, respond, runCommand, runTool, writeFile } from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    type: {
      type: ['string', 'null'],
      description: 'タスク管理ツールの種類。未指定なら project.ts の TASK_TRACKER を使う',
    },
    title: { type: 'string', description: 'issue タイトル' },
    body: { type: 'string', description: 'issue 本文（Markdown）' },
    tempFilePath: {
      type: 'string',
      description:
        '本文を書き出す一時ファイルのパス。並行実行される他の呼び出しと衝突しない一意なパスを呼び出し側で指定すること',
    },
  },
  required: ['type', 'title', 'body', 'tempFilePath'],
} as const satisfies Schema

export function issueCreate(args: Infer<typeof ARGS_SCHEMA>): string | null {
  const type = args.type || TASK_TRACKER

  switch (type) {
    case 'github':
      writeFile(args.tempFilePath, args.body)
      return runCommand([
        `gh issue create --repo ${TARGET_REPO} --title ${args.title} --body-file ${args.tempFilePath} --add-assignee ${ASSIGNEE} && rm -f ${args.tempFilePath}`,
      ])
    default:
      return runTool(
        `ToolSearch で "${type}" 用の作成 MCP ツールを探し、title: "${args.title}" body:\n${args.body}\nの内容で作成する`,
      )
  }
}

respond(issueCreate(getArgs(ARGS_SCHEMA)))

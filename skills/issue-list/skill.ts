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
    structured: {
      type: 'boolean',
      description:
        'true かつ type が github の場合、フラットな説明文ではなく {number,url,title,body} の構造化配列を返す（他バックエンドでは無視され、通常のフラット文字列配列を返す）',
    },
    withDependencies: {
      type: 'boolean',
      description:
        'true の場合（structured:true かつ type が github の場合のみ有効）、各issueに本文の「依存関係」セクションが指す未解決issue番号 dependsOnOpenIssues を付与する',
    },
  },
  required: ['type', 'assigneeOnly', 'structured', 'withDependencies'],
} as const satisfies Schema

const ISSUES_SCHEMA = {
  type: 'array',
  items: { type: 'string' },
  description: '各 issue/タスクを1件ごとの説明文にした配列（無ければ空配列）',
} as const satisfies Schema

const RAW_ISSUES_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      number: { type: 'integer' },
      url: { type: 'string' },
      title: { type: 'string' },
      body: { type: ['string', 'null'] },
    },
    required: ['number', 'url', 'title', 'body'],
  },
  description: '各 issue/タスクを {number,url,title,body} に構造化した配列（無ければ空配列）',
} as const satisfies Schema

const DEPENDENCIES_SCHEMA = {
  type: 'object',
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          number: { type: 'integer' },
          dependsOnOpenIssues: {
            type: 'array',
            items: { type: 'integer' },
            description:
              '本文の「依存関係」セクションが前提とする他issueのうち、同じ一覧の中に実在するものの番号一覧。前提が無い、または前提issueが一覧に見当たらない（＝解決済み）場合は空配列',
          },
        },
        required: ['number', 'dependsOnOpenIssues'],
      },
    },
  },
  required: ['issues'],
} as const satisfies Schema

export type RawIssue = Infer<typeof RAW_ISSUES_SCHEMA>[number]
export type RawIssueWithDependencies = RawIssue & { dependsOnOpenIssues: number[] }

export function issueList(
  args: Infer<typeof ARGS_SCHEMA> & { structured: true; withDependencies: true },
): RawIssueWithDependencies[]
export function issueList(args: Infer<typeof ARGS_SCHEMA> & { structured: true }): RawIssue[]
export function issueList(args: Infer<typeof ARGS_SCHEMA> & { structured: false }): string[]
export function issueList(
  args: Infer<typeof ARGS_SCHEMA>,
): string[] | RawIssue[] | RawIssueWithDependencies[]
export function issueList(
  args: Infer<typeof ARGS_SCHEMA>,
): string[] | RawIssue[] | RawIssueWithDependencies[] {
  const type = args.type || TASK_TRACKER

  switch (type) {
    case 'github': {
      const assigneeFlag = args.assigneeOnly ? `--assignee ${ASSIGNEE} ` : ''
      const raw = runCommand([
        `gh issue list --repo ${TARGET_REPO} ${assigneeFlag}--state open --json number,url,title,body`,
      ])
      const issues: RawIssue[] = JSON.parse(raw || '[]')
      if (!args.structured) return issues.map((issue) => `#${issue.number} ${issue.title}: ${issue.body}`)
      if (!args.withDependencies || issues.length === 0) return issues

      const deps = complete(
        dedent`
          以下の issue それぞれについて、本文の「依存関係」セクションが前提とする他issueが
          この一覧の中に実在すれば、その番号を dependsOnOpenIssues に含めてください。

          ${JSON.stringify(issues)}
        `,
        DEPENDENCIES_SCHEMA,
      )
      const depsMap = new Map(deps.issues.map((i) => [i.number, i.dependsOnOpenIssues]))
      return issues.map((issue) => ({
        ...issue,
        dependsOnOpenIssues: depsMap.get(issue.number) ?? [],
      }))
    }
    default:
      if (args.structured) {
        return complete(
          dedent`
            ToolSearch で "${type}" 用の読み取り専用 MCP ツールを探し、open な issue/タスク一覧を
            {number,url,title,body} の配列として取得してください
            ${args.assigneeOnly ? '（project.ts の ASSIGNEE 担当分のみに絞る）' : ''}
          `,
          RAW_ISSUES_SCHEMA,
        )
      }
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

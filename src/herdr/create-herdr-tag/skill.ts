import { ASSIGNEE, TARGET_REPO, TASK_TRACKER } from '../../../local/project.js'
import { getArgs } from '../../shared/args.js'
import { type Schema, complete, respond, runCommand } from '../../shared/complete.js'
import type { Infer } from '../../shared/infer.js'
import { dedent } from '../../shared/utils.js'

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
        'string: チェックアウトする既存ブランチ名（＝対応する PR が存在する）, null: 新規 issue 対応でまだ無い場合',
    },
  },
  required: ['issueNumber', 'branch'],
} as const satisfies Schema

export const RESULT_SCHEMA = {
  type: ['string', 'null'],
  enum: ['REV', 'PRE', null],
  description:
    'herdr space/agent ラベルに付けるタグ。"REV": レビュー作業用（[REV]-番号 / r番号）, "PRE": ステータス未確定のタスク用（[PRE]-番号 / p番号）, null: 通常の実装作業用（番号のみ / t番号）',
} as const satisfies Schema

const TASK_PREPARING_SCHEMA = {
  type: 'object',
  properties: {
    preparing: {
      type: 'boolean',
      description:
        'true: まだ着手できる状態ではない（未着手・準備中・仕様確認待ち等）, false: 着手可能（進行中・対応待ち等）',
    },
  },
  required: ['preparing'],
} as const satisfies Schema

function herdrTagForPr(branch: string): Infer<typeof RESULT_SCHEMA> {
  const raw = runCommand([
    `gh pr view ${branch} --repo ${TARGET_REPO} --json author,assignees,reviewRequests`,
  ])
  if (!raw) return null

  const pr = JSON.parse(raw) as {
    author: { login: string }
    assignees: { login: string }[]
    reviewRequests: { login: string }[]
  }

  const isOwnPr = pr.author.login === ASSIGNEE || pr.assignees.some((a) => a.login === ASSIGNEE)
  if (isOwnPr) return null

  const isRequestedReviewer = pr.reviewRequests.some((r) => r.login === ASSIGNEE)
  if (isRequestedReviewer) return 'REV'

  return null
}

function herdrTagForTask(issueNumber: number): Infer<typeof RESULT_SCHEMA> {
  let preparing: boolean

  if (TASK_TRACKER === 'github') {
    const labels =
      runCommand([
        `gh issue view ${issueNumber} --repo ${TARGET_REPO} --json labels --jq '.labels[].name'`,
      ]) || ''
    preparing = /準備中|not.?ready|todo|backlog/i.test(labels)
  } else if (TASK_TRACKER) {
    preparing = complete(
      dedent`
        ToolSearch で "${TASK_TRACKER}" 用の読み取り専用 MCP ツールを探し、
        issue番号 ${issueNumber} に対応するタスクの現在のステータスを確認してください
      `,
      TASK_PREPARING_SCHEMA,
    ).preparing
  } else {
    preparing = false
  }

  return preparing ? 'PRE' : null
}

export function createHerdrTag(args: Infer<typeof ARGS_SCHEMA>): Infer<typeof RESULT_SCHEMA> {
  const { issueNumber, branch } = args
  if (branch) return herdrTagForPr(branch)
  return herdrTagForTask(issueNumber)
}

respond(createHerdrTag(getArgs(ARGS_SCHEMA)))

import { gitPrReviewStatus } from '../git/pr/review/status/skill.js'
import { gitWorktreeCreate } from '../git/worktree/create/skill.js'
import {
  ASSIGNEE,
  PROJECT_ROOT,
  RESEARCH_SOURCES,
  TARGET_REPO,
  TICKET_PREFIX,
  USE_HERDR_WORKSPACE,
} from '../../local/project.js'
import {
  type Schema,
  complete,
  exit,
  remember,
  respond,
  runCommand,
} from '../shared/complete.js'
import { dedent } from '../shared/utils.js'

remember([
  'ここでは実装・レビューは行わない。herdr agent セッションへ作業指示を送るだけ',
  'GitHub は読み取りのみ行うこと（コメント・マージ等は行わない）',
  'Notion は読み取りのみ行うこと（ページ編集・コメント等は行わない）',
])

type PrItem = { number: number; url: string; headRefName: string }

const TASK_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      number: {
        type: 'integer',
        description: `userDefined:ID（例 "${TICKET_PREFIX}-424"）から抽出した番号部分`,
      },
      url: { type: 'string' },
      title: { type: 'string' },
      status: { type: 'string' },
    },
    required: ['number', 'url', 'title', 'status'],
  },
} as const satisfies Schema

type TaskItem = { number: number; url: string; title: string; status: string }

const PREPARING_STATUS = '準備中'
const READY_STATUS = '着手可能'

function ticketPath(number: number): string {
  return `${PROJECT_ROOT}/.claude/local/worktrees/${TICKET_PREFIX}-${number}`
}

function worktreeExists(number: number): boolean {
  const list = runCommand(['git worktree list --porcelain']) || ''
  return list.includes(ticketPath(number))
}

function extractTicketNumber(text: string, fallback: number): number {
  const m = text.match(new RegExp(`${TICKET_PREFIX}-(\\d+)`, 'i'))
  return m ? Number(m[1]) : fallback
}

function fetchMyOpenPrs(): PrItem[] {
  const raw = runCommand([
    `gh pr list --repo ${TARGET_REPO} --author ${ASSIGNEE} --state open --json number,url,headRefName`,
  ])
  return raw ? JSON.parse(raw) : []
}

function fetchReviewRequestedPrs(): PrItem[] {
  const raw = runCommand([
    `gh pr list --repo ${TARGET_REPO} --search "review-requested:${ASSIGNEE}" --state open --json number,url,headRefName`,
  ])
  return raw ? JSON.parse(raw) : []
}

function fetchMyPendingOrReadyTasks(): TaskItem[] {
  const taskSource = RESEARCH_SOURCES.find(
    (s) => s.type === 'notion' && /タスク/.test(s.label ?? ''),
  )
  if (!taskSource) return []

  return complete(
    dedent`
      Notion のタスク一覧（${taskSource.value}）から、担当者が ${ASSIGNEE} で、
      ステータスが「${PREPARING_STATUS}」または「${READY_STATUS}」のタスクだけを抽出してください
      各タスクの number は userDefined:ID（例 "${TICKET_PREFIX}-424"）の番号部分だけを返してください
    `,
    TASK_SCHEMA,
  )
}

function resolveHerdrTarget(number: number): string | null {
  const raw = runCommand([
    `herdr agent list 2>/dev/null | jq -r --arg p "${ticketPath(number)}" '.result.agents[]? | select(.cwd==$p) | (.name // .pane_id)' || true`,
  ])
  return raw?.trim() || null
}

function resolveOrCreateTarget(pr: PrItem): string | null {
  const number = extractTicketNumber(pr.headRefName, pr.number)
  const existing = resolveHerdrTarget(number)
  if (existing) return existing

  const created = gitWorktreeCreate({ issueNumber: number, branch: pr.headRefName })
  return created.agentName
}

function sendToHerdrAgent(target: string, commands: string[], notes: string[] = []) {
  const message = [...commands, ...notes].join('\n')
  runCommand([`herdr agent prompt "${target}" "${message}" || true`])
}

export function dispatchWork(): string {
  if (!USE_HERDR_WORKSPACE) exit('herdr 連携が無効です（project.ts の USE_HERDR_WORKSPACE が false）')

  const dispatched: string[] = []

  // ─── Phase 1: 担当 PR の未解決指摘チェック ───────────────────
  phase('担当PRの未解決指摘チェック')

  for (const pr of fetchMyOpenPrs()) {
    const status = gitPrReviewStatus({ prNumber: pr.number })
    if (!status.hasComments || status.allResolved) continue

    const target = resolveOrCreateTarget(pr)
    if (!target) continue

    sendToHerdrAgent(
      target,
      [`/git-pr-resolve-comments workingDir: ., url: ${pr.url}, autonomous: false`],
      ['指摘ごとに、対応すべきかどうかの妥当性も判断して提示して'],
    )
    dispatched.push(`PR #${pr.number}（指摘対応） -> ${target}`)
  }

  // ─── Phase 2: レビュー依頼されている PR への新規 worktree 作成 ─
  phase('レビュー依頼PRへの新規worktree作成')

  for (const pr of fetchReviewRequestedPrs()) {
    const target = resolveOrCreateTarget(pr)
    if (!target) continue

    sendToHerdrAgent(
      target,
      [
        `/draft-spec workingDir: ., supplement: ${pr.url}`,
        '/review-diff workingDir: .',
        '/test-scenario workingDir: ., content: このブランチで対応した内容',
      ],
      ['上から順に実行し、それぞれの結果をまとめて提示して', '修正は行わず、レビュー材料の作成までにとどめて'],
    )
    dispatched.push(`PR #${pr.number}（レビュー） -> ${target}`)
  }

  // ─── Phase 3: 担当タスク一覧から未着手 worktree を作成 ─────────
  phase('担当タスクの未着手worktree作成')

  const preTagged: { number: number; target: string }[] = []

  for (const task of fetchMyPendingOrReadyTasks()) {
    if (worktreeExists(task.number)) continue

    const isPreparing = task.status === PREPARING_STATUS
    const created = gitWorktreeCreate({ issueNumber: task.number, branch: null })
    if (!created.agentName) continue

    sendToHerdrAgent(
      created.agentName,
      [`/implement ${task.url}`, '/review-diff workingDir: .'],
      [
        ...(isPreparing ? [`ステータスが${PREPARING_STATUS}でも一旦仮で実装を進めること`] : []),
        'db への push・コミットは行わないこと',
        '動作確認が必要になったら自分でサーバーを起動せず、必要な旨だけ報告すること',
      ],
    )
    dispatched.push(
      `${TICKET_PREFIX}-${task.number}（タスク${isPreparing ? `/${PREPARING_STATUS}` : ''}） -> ${created.agentName}`,
    )

    if (isPreparing) preTagged.push({ number: task.number, target: created.agentName })
  }

  // ─── Phase 4: 準備中タグの最終確認・更新 ───────────────────────
  if (preTagged.length > 0) {
    phase('準備中タスクのステータス再確認')

    const stillPreparing = new Set(
      fetchMyPendingOrReadyTasks()
        .filter((t) => t.status === PREPARING_STATUS)
        .map((t) => t.number),
    )

    for (const { number, target } of preTagged) {
      if (stillPreparing.has(number)) continue

      const newTarget = `t${number}`
      runCommand([
        `WS_ID=$(herdr agent get "${target}" | jq -r '.result.agent.workspace_id') && herdr workspace rename "$WS_ID" "${number}" && herdr agent rename "${target}" "${newTarget}" || true`,
      ])
      dispatched.push(`${TICKET_PREFIX}-${number}: [PRE] 解除 (${target} -> ${newTarget})`)
    }
  }

  return dispatched.length > 0
    ? dedent`
        ${dispatched.length} 件送信しました

        ${dispatched.join('\n')}
      `
    : '対象なし（未解決の指摘・レビュー依頼・未着手タスクはありませんでした）'
}

respond(dispatchWork())

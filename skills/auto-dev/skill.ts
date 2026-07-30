import {
  ASSIGNEE,
  AUTO_DEV_ISSUE_MAX_ITERATIONS,
  AUTO_DEV_MAX_CONCURRENT,
  AUTO_DEV_RATIO_AUTO_DEV,
  AUTO_DEV_RATIO_DIRECTION,
  AUTO_DEV_RATIO_PR_REVIEW,
  TARGET_REPO,
  USE_AUTO_DEV,
} from '../../local/project.js'
import {
  type Schema,
  complete,
  exit,
  readFile,
  remember,
  respond,
  runCommand,
  writeFile,
} from '../_shared/complete.js'
import { dedent } from '../_shared/utils.js'

if (!USE_AUTO_DEV) {
  exit('このプロジェクトでは auto-dev が無効化されています（project.ts の USE_AUTO_DEV を確認）')
}

remember([
  'このスキルの役割は起動判定・状態管理・workflow の管理（起動先の選定）まで。issue/PR の実装内容そのものには立ち入らない',
  'Workflow の起動は必ず本物の Workflow() 呼び出しで行う（シミュレーションしない）',
])

const CRON_PROMPT = 'auto-dev スキルを実行してください。'

const cronList = String(CronList())
const alreadyScheduled = complete(
  dedent`
    以下は CronList() の実行結果です。
    prompt に "${CRON_PROMPT}" を含むジョブが既に登録されているか判断してください。

    ${cronList}
  `,
  { type: 'boolean' },
)
if (!alreadyScheduled) {
  CronCreate({ cron: '* * * * *', prompt: CRON_PROMPT, recurring: true })
}

const STATE_PATH = '.claude/local/running-workflows.json'

type WorkflowType = 'auto-dev' | 'pr-review' | 'direction'
type DirectWorkflowType = 'pr-review' | 'direction'

const TARGET_RATIO: Record<WorkflowType, number> = {
  'auto-dev': AUTO_DEV_RATIO_AUTO_DEV,
  'pr-review': AUTO_DEV_RATIO_PR_REVIEW,
  direction: AUTO_DEV_RATIO_DIRECTION,
}

type ScriptKind = 'issue' | 'pr-comment' | DirectWorkflowType

const SCRIPT_PATHS: Record<ScriptKind, string> = {
  issue: '.claude/skills/auto-dev/issue-workflow.js',
  'pr-comment': '.claude/skills/auto-dev/pr-comment-workflow.js',
  'pr-review': '.claude/skills/auto-dev/pr-review-workflow.js',
  direction: '.claude/skills/auto-dev/direction-workflow.js',
}

type RunningEntry = {
  taskId: string
  type: WorkflowType
  kind: 'issue' | 'pr-comment' | null
  target: string
  worktreePath: string | null
  launchedAt: string
}

function formatRunning(entries: RunningEntry[]): string {
  if (entries.length === 0) return '(実行中の workflow なし)'
  return entries.map((entry) => `- ${entry.target} [${entry.kind || entry.type}]`).join('\n')
}

// ─── Phase 1: 状態読み込み・プルーニング ─────────────────────────
phase('状態読み込み・プルーニング')

const raw = readFile(STATE_PATH)
const running: RunningEntry[] = raw ? JSON.parse(raw).running : []

const stillRunning = running.filter((entry) =>
  String(TaskOutput({ task_id: entry.taskId, block: false, timeout: 0 })).includes(
    '<status>running</status>',
  ),
)

writeFile(STATE_PATH, JSON.stringify({ running: stillRunning }, null, 2))

// ─── Phase 2: 起動判定 ────────────────────────────────────────
phase('起動判定')

if (stillRunning.length >= AUTO_DEV_MAX_CONCURRENT) {
  respond(dedent`
    実行中 ${stillRunning.length}/${AUTO_DEV_MAX_CONCURRENT} 件のため、今回は新規起動しません

    ${formatRunning(stillRunning)}
  `)
  exit()
}

const counts: Record<WorkflowType, number> = { 'auto-dev': 0, 'pr-review': 0, direction: 0 }
for (const entry of stillRunning) counts[entry.type]++

const openIssueCount =
  Number(
    runCommand([
      `gh issue list --repo ${TARGET_REPO} --assignee ${ASSIGNEE} --state open --json number --jq length`,
    ]),
  ) || 0
const openPrCount =
  Number(
    runCommand([
      `gh pr list --repo ${TARGET_REPO} --author ${ASSIGNEE} --state open --json number --jq length`,
    ]),
  ) || 0

const MAX_CONCURRENT_DIRECTION = 1
const DIRECTION_ISSUE_BACKLOG_LIMIT = 5

const directionAllowed =
  counts['direction'] < MAX_CONCURRENT_DIRECTION && openIssueCount < DIRECTION_ISSUE_BACKLOG_LIMIT

const HAS_TARGET: Record<WorkflowType, boolean> = {
  'auto-dev': openIssueCount > 0 || openPrCount > 0,
  'pr-review': openPrCount > 0,
  direction: directionAllowed,
}

const eligible = (Object.keys(TARGET_RATIO) as WorkflowType[]).filter((t) => HAS_TARGET[t])

if (eligible.length === 0) {
  respond(dedent`
    対応対象の issue・PR が無く、direction も起動条件（同時実行${MAX_CONCURRENT_DIRECTION}件まで・open issue ${DIRECTION_ISSUE_BACKLOG_LIMIT}件未満）を満たさないため、今回は新規起動しません

    実行中 ${stillRunning.length}/${AUTO_DEV_MAX_CONCURRENT}（auto-dev:${counts['auto-dev']} pr-review:${counts['pr-review']} direction:${counts['direction']}）
    ${formatRunning(stillRunning)}
  `)
  exit()
}

const nextType: WorkflowType = eligible
  .sort((a, b) => TARGET_RATIO[b] - TARGET_RATIO[a])
  .reduce((best, t) => (counts[t] / TARGET_RATIO[t] < counts[best] / TARGET_RATIO[best] ? t : best))

// ─── Phase 3: workflow 起動 ────────────────────────────────────
phase('workflow 起動')

const DETECTED_SCHEMA: Schema = {
  type: 'object',
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          number: { type: 'integer' },
          url: { type: 'string' },
          title: { type: 'string' },
          blocked: {
            type: 'boolean',
            description:
              '本文の「依存関係」セクションが名指しする前提（他issueの実装・決定事項など）が、まだ open のまま未解決の場合は true。前提が無い、または前提が既に解決済み（該当issueがopen一覧に無い＝クローズ済み）の場合は false',
          },
          blockedReason: {
            type: ['string', 'null'],
            description: 'blocked が true の場合、何が前提でブロックされているかを簡潔に。false の場合は null',
          },
        },
        required: ['number', 'url', 'title', 'blocked', 'blockedReason'],
      },
    },
    prs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          number: { type: 'integer' },
          url: { type: 'string' },
          branch: { type: 'string', description: 'PR の head ブランチ名（headRefName）' },
          issueNumber: {
            type: 'integer',
            description: 'PR の本文・タイトルから読み取れる、対応元 issue の番号（"Closes #5" 等）',
          },
        },
        required: ['number', 'url', 'branch', 'issueNumber'],
      },
    },
  },
  required: ['issues', 'prs'],
}

function resolveAutoDevTarget(): {
  scriptPath: string
  args: any
  kind: 'issue' | 'pr-comment'
  target: string
  worktreePath: string
} | null {
  const openIssues = runCommand([
    `gh issue list --repo ${TARGET_REPO} --assignee ${ASSIGNEE} --state open --json number,url,title,body`,
  ])
  const allPrs = runCommand([
    `gh pr list --repo ${TARGET_REPO} --state all --json number,title,body`,
  ])
  const openPrs = runCommand([
    `gh pr list --repo ${TARGET_REPO} --author ${ASSIGNEE} --state open --json number,url,headRefName,comments,reviews`,
  ])

  const detected = complete<{ issues: any[]; prs: any[] }>(
    dedent`
      以下の gh CLI 実行結果から、対応が必要な issue・PR を判定してください。
      過去に処理済みかどうかは問わず、現時点で対応が必要なものすべてが対象です。

      - issue: 対応する PR（issue番号を本文かタイトルに含むもの）がまだ無いもの
        各issueの本文にある「依存関係」セクションを確認し、そこで前提とされている作業（他issueの実装・技術選定など）が
        まだ open の別issueとして残っている（＝解決済みでない）場合は blocked:true, blockedReason に前提の内容を入れる。
        前提が無い、または前提が既にクローズ済み（open issue一覧に見当たらない）なら blocked:false, blockedReason:null とする
      - PR: 未対応のコメント・レビュー指摘があるもの（投稿者が ${ASSIGNEE} 自身かどうかは問わない
        最新のコメント/レビュー以降に、それへ対応した追加コミットがまだ無いものを対象とする）
        branch として headRefName を含める。
        本文・タイトルから "Closes #5" 等の issue 参照を issueNumber として含める。参照が読み取れない PR は対象から除外する

      ${ASSIGNEE} の open issue 一覧:
      ${openIssues}

      全 PR 一覧（issue 対応済みかの確認用）:
      ${allPrs}

      ${ASSIGNEE} の open PR 一覧（コメント・レビュー情報つき）:
      ${openPrs}
    `,
    DETECTED_SCHEMA,
  )

  const inProgress = stillRunning.map((entry) => entry.target).join(' ')
  const pr = detected.prs.find((pr) => !inProgress.includes(`issue #${pr.issueNumber}`))

  const PRIORITY_RANK: Record<string, number> = { high: 0, middle: 1, low: 2 }
  const priorityOf = (title: string) => PRIORITY_RANK[title.match(/^\[(high|middle|low)\]/)?.[1] ?? 'middle']

  const issue = detected.issues
    .filter((issue) => !issue.blocked)
    .filter((issue) => !inProgress.includes(`issue #${issue.number}`))
    .sort((a, b) => priorityOf(a.title) - priorityOf(b.title))[0]

  if (pr) {
    const worktreePath = Skill(
      'create-worktree',
      `issueNumber: ${pr.issueNumber}, branch: ${pr.branch}`,
    )
    return {
      scriptPath: SCRIPT_PATHS['pr-comment'],
      args: { pr, worktreePath },
      kind: 'pr-comment',
      target: `issue #${pr.issueNumber}（PR #${pr.number}）`,
      worktreePath,
    }
  }
  if (issue) {
    const worktreePath = Skill('create-worktree', `issueNumber: ${issue.number}, branch: null`)
    return {
      scriptPath: SCRIPT_PATHS['issue'],
      args: { issue, worktreePath, maxIterations: AUTO_DEV_ISSUE_MAX_ITERATIONS },
      kind: 'issue',
      target: `issue #${issue.number}`,
      worktreePath,
    }
  }
  return null
}

function resolvePrReviewTarget(): {
  scriptPath: string
  args: any
  kind: null
  target: string
  worktreePath: string
} | null {
  const openPrsJson = runCommand([
    `gh pr list --repo ${TARGET_REPO} --author ${ASSIGNEE} --state open --json number,url,headRefName,body`,
  ])
  const prs = JSON.parse(openPrsJson || '[]')
    .map((pr: any) => ({
      number: pr.number,
      url: pr.url,
      branch: pr.headRefName,
      issueNumber: Number((pr.body || '').match(/Closes #(\d+)/i)?.[1]) || null,
    }))
    .filter((pr: any) => pr.issueNumber)

  const inProgress = stillRunning.map((entry) => entry.target).join(' ')
  const pr = prs.find((pr: any) => !inProgress.includes(`issue #${pr.issueNumber}`))
  if (!pr) return null

  const worktreePath = Skill(
    'create-worktree',
    `issueNumber: ${pr.issueNumber}, branch: ${pr.branch}`,
  )
  return {
    scriptPath: SCRIPT_PATHS['pr-review'],
    args: { pr, worktreePath },
    kind: null,
    target: `issue #${pr.issueNumber}（PR #${pr.number} レビュー）`,
    worktreePath,
  }
}

let target
switch (nextType) {
  case 'auto-dev':
    target = resolveAutoDevTarget()
    break
  case 'pr-review':
    target = resolvePrReviewTarget()
    break
  case 'direction':
    target = {
      scriptPath: SCRIPT_PATHS['direction'],
      args: undefined,
      kind: null,
      target: 'direction 生成',
      worktreePath: null,
    }
    break
}

if (!target) {
  respond(dedent`
    対応対象の issue・PR がないため、今回は新規起動しません

    実行中 ${stillRunning.length}/${AUTO_DEV_MAX_CONCURRENT}（auto-dev:${counts['auto-dev']} pr-review:${counts['pr-review']} direction:${counts['direction']}）
    ${formatRunning(stillRunning)}
  `)
  exit()
}

const launch = Workflow({ scriptPath: target.scriptPath, args: target.args })
const taskId = String(launch).match(/Task ID:\s*(\S+)/)?.[1] ?? ''

stillRunning.push({
  taskId,
  type: nextType,
  kind: target.kind,
  target: target.target,
  worktreePath: target.worktreePath,
  launchedAt: new Date().toISOString(),
})
writeFile(STATE_PATH, JSON.stringify({ running: stillRunning }, null, 2))

counts[nextType]++
respond(dedent`
  ${nextType} を起動: ${target.target}

  実行中 ${stillRunning.length}/${AUTO_DEV_MAX_CONCURRENT}（auto-dev:${counts['auto-dev']} pr-review:${counts['pr-review']} direction:${counts['direction']}）
  ${formatRunning(stillRunning)}
`)

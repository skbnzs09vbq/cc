import { gitWorktreeCreate } from '../git/worktree/create/skill.js'
import {
  ASSIGNEE,
  BASE_BRANCH,
  PROJECT_ROOT,
  RESEARCH_SOURCES,
  TICKET_PREFIX,
  USE_HERDR_WORKSPACE,
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
} from '../shared/complete.js'
import { PROGRESS_PATH, TEST_LOCK_PATH, WORKTREE_DIR } from '../shared/paths.js'
import { dedent } from '../shared/utils.js'
import {
  type PendingPr,
  conflictingPrs,
  prsAwaitingMyReview,
  prsWithUnresolvedComments,
} from '../git/pr/pending.js'
import { herdrFindAgent, herdrSend, herdrWorktreePath } from '../herdr/agent.js'
import { devServer } from '../server/dev/skill.js'
import { collectEvidence } from '../evidence/skill.js'
import { type Progress, parseProgress, progress } from '../progress/skill.js'
import { readQueue, writeQueue } from '../request/skill.js'

remember([
  'ここでは実装・レビューは行わない。herdr agent セッションへ作業指示を送るだけ',
  'GitHub は読み取りのみ行うこと（コメント・マージ等は行わない）',
  'Notion は読み取りのみ行うこと（ページ編集・コメント等は行わない）',
  'commit・push・PR 作成を worktree に指示しないこと。これらは user の明示的な許可が必要で、許可は board から /request 経由で渡される',
])

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

function worktreeExists(number: number): boolean {
  const list = runCommand(['git worktree list --porcelain']) || ''
  return list.includes(herdrWorktreePath(number))
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

function prepareForPr(pr: PendingPr): () => string | null {
  return () =>
    herdrFindAgent(pr.issue) ??
    gitWorktreeCreate({ issueNumber: pr.issue, branch: pr.headRefName }).agentName
}

function prepareForTask(task: TaskItem): () => string | null {
  return () => {
    const created = gitWorktreeCreate({ issueNumber: task.number, branch: null })
    if (!created.agentName) return null

    progress({
      workingDir: created.worktreePath,
      status: null,
      task: task.url,
      now: null,
      done: null,
      next: null,
      questions: null,
      resolved: null,
      pending: null,
    })

    return created.agentName
  }
}

const STALE_MINUTES = 30
const TEST_LOCK_MINUTES = 45
const QUEUE_BATCH = 3
const MIN_ACTIVE_WORKTREES = 3

const PRIORITY = {
  prComments: 1,
  conflict: 2,
  starvedNewIssue: 3,
  fixingStale: 4,
  verifyingStale: 5,
  workingStale: 6,
  idleNext: 7,
  reviewRequest: 8,
  newIssue: 9,
  blocked: 10,
}

const NO_GIT_WRITE = [
  'commit・push・PR 作成は行わないでください（user の許可が必要です）',
]

const CRON_SCHEDULE = '3,13,23,33,43,53 * * * *'
const CRON_PROMPT = dedent`
  dispatch-work スキルを実行してください
  前回の結果を再掲するだけで終わらせず、必ず skill.ts の Phase 1 から全フェーズを実行し直し、
  そのときの progress.md の内容で判断し直すこと
`

type Candidate = {
  priority: number
  number: number
  label: string
  target: string | null
  prepare: (() => string | null) | null
  commands: string[]
  notes: string[]
  needsServer: boolean
}

type WorktreeEntry = { name: string; number: number; path: string; progress: Progress | null }

function listWorktrees(): WorktreeEntry[] {
  const root = `${PROJECT_ROOT}/${WORKTREE_DIR}`
  const names = (runCommand([`ls -1 ${root} 2>/dev/null || true`]) || '')
    .split('\n')
    .map((n) => n.trim())
    .filter(Boolean)

  return names.flatMap((name) => {
    const number = Number(name.match(/(\d+)/)?.[1])
    if (!Number.isFinite(number)) return []
    const path = `${root}/${name}`
    return [{ name, number, path, progress: parseProgress(readFile(`${path}/${PROGRESS_PATH}`)) }]
  })
}

function minutesSince(at: string | null): number | null {
  if (!at) return null
  const elapsed = Number(
    runCommand([`echo $(( ( $(date -u +%s) - $(date -u -d '${at}' +%s) ) / 60 ))`]),
  )
  return Number.isFinite(elapsed) ? elapsed : null
}

function isStale(updated: string | null, limit = STALE_MINUTES): boolean {
  const elapsed = minutesSince(updated)
  return elapsed === null || elapsed >= limit
}

function activeTestIssue(entries: { number: number; progress: Progress }[]): number | null {
  const lockPath = `${PROJECT_ROOT}/${TEST_LOCK_PATH}`
  const lock: { issue: number; startedAt: string } | null = JSON.parse(readFile(lockPath) || 'null')

  if (lock) {
    const holder = entries.find((e) => e.number === lock.issue)
    const expired = isStale(lock.startedAt, TEST_LOCK_MINUTES)
    const finished =
      holder !== undefined &&
      holder.progress.status !== 'verifying' &&
      !isStale(holder.progress.updated, TEST_LOCK_MINUTES)

    if (!expired && !finished) return lock.issue
    runCommand([`rm -f ${lockPath}`])
  }

  const verifying = entries.find(
    (e) => e.progress.status === 'verifying' && !isStale(e.progress.updated, TEST_LOCK_MINUTES),
  )
  return verifying?.number ?? null
}

const SERVER_COMMANDS = ['/test-run', '/test-e2e', '/test-api', '/test-visual-diff']

function needsServerFor(commands: string[]): boolean {
  return commands.some((c) => SERVER_COMMANDS.some((command) => c.includes(command)))
}

function acquireTestLock(issue: number) {
  devServer({ target: `${TICKET_PREFIX || 'issue'}-${issue}` })
  writeFile(
    `${PROJECT_ROOT}/${TEST_LOCK_PATH}`,
    JSON.stringify({ issue, startedAt: runCommand(['date -u +%FT%TZ'])?.trim() ?? '' }, null, 2),
  )
}

const REVIEW_POLICY = [
  '他人の PR のレビューです。実装の修正・指摘の投稿は一切行わないでください',
  'レビュー結果（対応内容の要約・検出した問題・検証結果）を walkthrough の項目にまとめ、1件目の解説まで進めた状態で停止してください',
  '取り込むかどうかの判断と指摘の投稿は user が行います',
  '/progress workingDir: ., status: talking で user 待ちであることを記録してください',
]

const POLICY = [
  '決めきれない箇所は questions に挙げて TODO/スタブで置き、それ以外は最後まで進めること',
  'テストまで通してから停止すること',
  '終わったら /progress で status・questions・pending を更新すること',
]

function nextCommand(entry: { number: number; progress: Progress }): string[] {
  const { progress } = entry
  const done = progress.done.join(' / ') || '実装内容'

  if (progress.status === 'idle' && progress.done.length === 0)
    return [`/implement ${progress.task ?? `${TICKET_PREFIX}-${entry.number}`}`]
  if (progress.status === 'idle' && progress.pending === 0 && progress.done.length > 0)
    return [`/test-run workingDir: ., content: ${done}`]
  if (progress.status === 'verifying') return ['/review-diff workingDir: .']
  if (progress.status === 'fixing') return ['/review-diff workingDir: .']
  return ['続きを進めてください']
}

export function dispatchWork(): string {
  if (!USE_HERDR_WORKSPACE) exit('herdr 連携が無効です（project.ts の USE_HERDR_WORKSPACE が false）')

  // ─── Phase 1: 定期実行の登録 ─────────────────────────────────
  phase('定期実行の登録')

  const scheduled = String(CronList()).includes(CRON_PROMPT.split('\n')[0])
  if (!scheduled) CronCreate({ cron: CRON_SCHEDULE, prompt: CRON_PROMPT, recurring: true })

  // ─── Phase 2: 既存 worktree の状況収集 ───────────────────────
  phase('既存worktreeの状況収集')

  const all = listWorktrees()

  const bootstrapped = all
    .filter((e) => e.progress === null)
    .filter((e) => {
      const agent = herdrFindAgent(e.number)
      return agent
        ? herdrSend(
            agent,
            ['/progress workingDir: ., status: idle, now: 状況の記録を開始しました'],
            [
              'この worktree にはまだ progress.md がありません',
              '現在のブランチと変更内容を確認し、いまの状況を now・done・next に反映してください',
              ...POLICY,
            ],
          )
        : false
    })
    .map((e) => e.name)

  const entries = all.flatMap((e) => (e.progress ? [{ ...e, progress: e.progress }] : []))

  const candidates: Candidate[] = []

  for (const entry of entries) {
    const { progress } = entry
    if (progress.status === 'talking') continue

    const target = herdrFindAgent(entry.number)
    if (!target) continue

    const stale = isStale(progress.updated)

    if (progress.status === 'done') continue

    if (progress.status === 'blocked') {
      candidates.push({
        priority: PRIORITY.blocked,
        number: entry.number,
        needsServer: false,
        label: `${TICKET_PREFIX}-${entry.number}（blocked・復旧）`,
        target,
        prepare: null,
        commands: ['何が原因で進められないのかを調べ、復旧できるなら復旧して進めてください'],
        notes: POLICY,
      })
      continue
    }

    if (progress.status === 'idle') {
      if (progress.questions.length > 0 && progress.pending > 0) continue

      candidates.push({
        priority: PRIORITY.idleNext,
        number: entry.number,
        needsServer: needsServerFor(nextCommand(entry)),
        label: `${TICKET_PREFIX}-${entry.number}（次フェーズへ）`,
        target,
        prepare: null,
        commands: nextCommand(entry),
        notes: POLICY,
      })
      continue
    }

    if (!stale) continue

    const priority =
      {
        fixing: PRIORITY.fixingStale,
        verifying: PRIORITY.verifyingStale,
        implementing: PRIORITY.workingStale,
        planning: PRIORITY.workingStale,
      }[progress.status] ?? PRIORITY.workingStale

    candidates.push({
      priority,
      number: entry.number,
      needsServer: needsServerFor(nextCommand(entry)),
      label: `${TICKET_PREFIX}-${entry.number}（${progress.status} が停滞）`,
      target,
      prepare: null,
      commands: nextCommand(entry),
      notes: POLICY,
    })
  }

  // ─── Phase 3: GitHub 側の検知（指摘・コンフリクト） ─────────
  phase('GitHub側の検知')

  const isTalking = (issue: number) =>
    entries.find((e) => e.number === issue)?.progress.status === 'talking'

  for (const pr of prsWithUnresolvedComments()) {
    if (isTalking(pr.issue)) continue

    candidates.push({
      priority: PRIORITY.prComments,
      number: pr.issue,
      target: herdrFindAgent(pr.issue),
      prepare: prepareForPr(pr),
      needsServer: false,
      label: `PR #${pr.number}（未解決の指摘）`,
      commands: [
        `/git-pr-comments-list prNumber: ${pr.number}`,
        '/walkthrough',
      ],
      notes: [
        `${pr.url} に未解決の指摘が来ています`,
        '指摘をすべて洗い出して walkthrough の項目にし、1件目の解説まで進めた状態で止めてください',
        '取り込むかどうかの判断は user がこのセッションを直接見て行います',
        '指摘への返信・リアクション・修正の着手は、user の指示があるまで一切行わないでください',
        '/progress workingDir: ., status: talking で user 待ちであることを記録してください',
        ...NO_GIT_WRITE,
      ],
    })
  }

  for (const pr of conflictingPrs()) {
    if (isTalking(pr.issue)) continue

    const target = herdrFindAgent(pr.issue)
    if (!target) continue

    candidates.push({
      priority: PRIORITY.conflict,
      number: pr.issue,
      target,
      prepare: null,
      needsServer: true,
      label: `PR #${pr.number}（${BASE_BRANCH} とコンフリクト）`,
      commands: [
        `/test-run workingDir: ., content: ${BASE_BRANCH} 取り込み前のベースライン`,
        `/test-visual-diff workingDir: ., base: HEAD, target: HEAD, description: ${BASE_BRANCH} 取り込み前の見た目のベースライン`,
      ],
      notes: [
        `${BASE_BRANCH} の取り込みとコンフリクト解消は user の許可が必要です`,
        'ここではベースラインの取得までにとどめ、取り込み自体は行わないでください',
        '取得したベースラインは progress.md の Done に記録してください',
        ...NO_GIT_WRITE,
      ],
    })
  }

  // ─── Phase 4: 依頼キューの消化 ─────────────────────────────
  phase('依頼キューの消化')

  const queue = readQueue()
  const testingForQueue = activeTestIssue(entries)

  const consumable = queue
    .filter((q) => {
      const entry = entries.find((e) => e.number === q.issue)
      if (entry?.progress.status === 'talking' && !q.force) return false
      if (needsServerFor([q.message]) && testingForQueue !== null && testingForQueue !== q.issue)
        return false
      return herdrFindAgent(q.issue) !== null
    })
    .slice(0, QUEUE_BATCH)

  if (consumable.length > 0) {
    let serverTaken = false

    const sent = consumable.filter((q) => {
      const agent = herdrFindAgent(q.issue)
      if (!agent) return false

      if (needsServerFor([q.message])) {
        if (serverTaken) return false
        acquireTestLock(q.issue)
        serverTaken = true
      }

      return herdrSend(agent, [q.message], POLICY)
    })

    writeQueue(queue.filter((q) => !sent.includes(q)))

    return dedent`
      依頼キューから ${sent.length} 件送信しました（残り ${queue.length - sent.length} 件）

      ${sent.map((q) => `- ${TICKET_PREFIX}-${q.issue}: ${q.message.split('\n')[0]}`).join('\n')}
    `
  }

  // ─── Phase 5: 新規タスク・レビュー依頼の取り込み ─────────────
  phase('新規タスク・レビュー依頼の取り込み')

  if (candidates.length === 0) {
    for (const pr of prsAwaitingMyReview()) {
      if (entries.some((e) => e.number === pr.issue)) continue
      if (isTalking(pr.issue)) continue

      candidates.push({
        priority: PRIORITY.reviewRequest,
        number: pr.issue,
        needsServer: true,
        label: `PR #${pr.number}（レビュー）`,
        target: null,
        prepare: prepareForPr(pr),
        commands: [
          `/draft-spec workingDir: ., supplement: ${pr.url}`,
          '/review-diff workingDir: .',
          '/test-run workingDir: ., content: このブランチで対応した内容',
          '/walkthrough',
        ],
        notes: REVIEW_POLICY,
      })
      break
    }
  }

  const activeCount = entries.filter((e) =>
    ['idle', 'planning', 'implementing', 'verifying', 'fixing'].includes(e.progress.status),
  ).length

  if (candidates.length === 0 || activeCount < MIN_ACTIVE_WORKTREES) {
    for (const task of fetchMyPendingOrReadyTasks()) {
      if (worktreeExists(task.number)) continue

      candidates.push({
        priority: activeCount < MIN_ACTIVE_WORKTREES ? PRIORITY.starvedNewIssue : PRIORITY.newIssue,
        number: task.number,
        needsServer: false,
        label: `${TICKET_PREFIX}-${task.number}（新規着手）`,
        target: null,
        prepare: prepareForTask(task),
        commands: [`/implement ${task.url}`],
        notes: [
          ...(task.status === PREPARING_STATUS
            ? [`ステータスが${PREPARING_STATUS}でも一旦仮で実装を進めること`]
            : []),
          'db への push・コミットは行わないこと',
          ...POLICY,
        ],
      })
      break
    }
  }

  // ─── Phase 6: 優先度が最も高い1件だけ実行 ───────────────────
  phase('優先度が最も高い1件だけ実行')

  if (candidates.length === 0)
    return bootstrapped.length
      ? `progress.md の作成を ${bootstrapped.length} 件に依頼しました: ${bootstrapped.join(', ')}`
      : '送る対象はありませんでした（talking のみ、または全て進行中）'

  const testingIssue = activeTestIssue(entries)

  const runnable = candidates.filter(
    (c) => !c.needsServer || testingIssue === null || testingIssue === c.number,
  )

  if (runnable.length === 0)
    return dedent`
      ${TICKET_PREFIX}-${testingIssue} がテスト実行中のため、dev サーバーを要する指示は送りませんでした

      待機中: ${candidates.length} 件
    `

  const sorted = runnable.sort((a, b) => a.priority - b.priority)

  let chosen: Candidate | null = null
  let target: string | null = null

  for (const candidate of sorted) {
    target = candidate.target ?? candidate.prepare?.() ?? null
    if (target) {
      chosen = candidate
      break
    }
  }

  if (!chosen || !target)
    return '送る対象はありましたが、agent セッションを用意できませんでした（herdr の起動を確認してください）'

  if (chosen.needsServer) acquireTestLock(chosen.number)

  herdrSend(target, chosen.commands, chosen.notes)

  // ─── Phase 7: 完了分の成果物を親へ取り込む ───────────────────
  phase('完了分の成果物を親へ取り込む')

  const awaitingApproval = entries.filter((e) => e.progress.status === 'done')

  const collected = entries
    .filter((e) => e.progress.status === 'done' || e.progress.status === 'fixing')
    .map((e) => collectEvidence({ issueNumber: e.number, worktreePath: e.path }))
    .filter((r) => r.collected > 0)

  return dedent`
    ${chosen.label} -> ${target}

    ${chosen.commands.map((c) => `- ${c}`).join('\n')}

    ${collected.length ? `取り込んだ検証結果: ${collected.map((c) => `${c.destination}（${c.collected}件）`).join(', ')}` : ''}

    ${awaitingApproval.length ? `承認待ち（commit・PR 作成には user の許可が必要）: ${awaitingApproval.map((e) => `${e.name}${e.progress.pending > 0 ? `（保留${e.progress.pending}件）` : ''}`).join(', ')}` : ''}

    ${bootstrapped.length ? `progress.md の作成を依頼: ${bootstrapped.join(', ')}` : ''}

    待機中: ${runnable.length - 1} 件
  `
}

respond(dispatchWork())

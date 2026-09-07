import { BASE_BRANCH, PROJECT_ROOT, TICKET_PREFIX } from '../../local/project.js'
import { parseArgs } from '../shared/args.js'
import { exit, readFile, respond, runCommand } from '../shared/complete.js'
import { PROGRESS_PATH, TEST_RUN_DIR, WORKTREE_DIR } from '../shared/paths.js'
import { displayWidth, truncate } from '../shared/utils.js'
import {
  conflictingPrs,
  myOpenPrs,
  prsAwaitingMyReview,
  prsWithUnresolvedComments,
} from '../git/pr/pending.js'
import { type Progress, parseProgress } from '../progress/skill.js'
import { readQueue, writeQueue } from '../request/skill.js'

type Entry = { name: string; path: string; progress: Progress }

const STALE_MINUTES = 30
const NOW_WIDTH = 30
const RULE_WIDTH = 56

function listEntries(): Entry[] {
  const root = `${PROJECT_ROOT}/${WORKTREE_DIR}`
  const names = (runCommand([`ls -1 ${root} 2>/dev/null || true`]) || '')
    .split('\n')
    .map((n) => n.trim())
    .filter(Boolean)

  return names.flatMap((name) => {
    const path = `${root}/${name}`
    const progress = parseProgress(readFile(`${path}/${PROGRESS_PATH}`))
    return progress ? [{ name, path, progress }] : []
  })
}

function minutesSince(updated: string | null): number | null {
  if (!updated) return null
  const elapsed = runCommand([`echo $(( ( $(date -u +%s) - $(date -u -d '${updated}' +%s) ) / 60 ))`])
  const minutes = Number(elapsed)
  return Number.isFinite(minutes) ? minutes : null
}

export function board(input: string): string {
  // ─── Phase 1: 全 worktree の状況収集 ───────────────────────
  phase('全 worktree の状況収集')

  const entries = listEntries()
  if (entries.length === 0) exit('progress.md を持つ worktree がありません')

  // ─── Phase 2: カードの作成 ─────────────────────────────────
  phase('カードの作成')

  const testing = entries.find((e) => e.progress.status === 'verifying')
  const queued = readQueue()
  const known = new Set(entries.map((e) => e.progress.issue))

  const openPrs = myOpenPrs()
  const commented = prsWithUnresolvedComments()
  const unresolved = new Set(commented.map((pr) => pr.issue))

  const reviewRequests = prsAwaitingMyReview()
  const reviewing = new Set(reviewRequests.map((pr) => pr.issue))

  const github = [
    ...commented.map((pr) => ({ pr, kind: 'unresolved comments' })),
    ...conflictingPrs().map((pr) => ({ pr, kind: `conflict with ${BASE_BRANCH}` })),
    ...reviewRequests.map((pr) => ({ pr, kind: 'review requested' })),
  ].filter(({ pr }) => !known.has(`${pr.issue}`))

  const nextAction = (e: Entry) => {
    if (e.progress.questions.length > 0 && e.progress.pending > 0)
      return {
        rank: 1,
        mark: '●',
        kind: '回答待ち',
        action: `\`/board ${e.progress.issue} <回答>\` で回答する`,
      }
    if (e.progress.status === 'talking')
      return { rank: 2, mark: '●', kind: '応答待ち', action: 'セッションを開いて直接判断する' }
    if (e.progress.done.some((d) => d.includes('ベースライン')))
      return {
        rank: 3,
        mark: '◐',
        kind: '取り込み承認待ち',
        action: `\`/board ${e.progress.issue} ${BASE_BRANCH} を取り込んで…\` と指示する`,
      }
    if (e.progress.status === 'done')
      return {
        rank: 3,
        mark: '◐',
        kind: '完了・承認待ち',
        action: `\`/board ${e.progress.issue} commit して PR を作って\` と指示する`,
      }
    if (e.progress.status === 'blocked')
      return { rank: 4, mark: '●', kind: '停止中', action: '原因を確認する' }
    return { rank: 9, mark: '○', kind: '進行中', action: '' }
  }

  const meta = (e: Entry) => {
    const elapsed = minutesSince(e.progress.updated)
    const label = reviewing.has(Number(e.progress.issue)) ? 'review' : e.progress.status
    return [
      '`' + label + '`',
      elapsed === null ? '' : `${elapsed}m${elapsed >= STALE_MINUTES ? ' 停滞' : ''}`,
      e.progress.pending > 0 ? `保留 ${e.progress.pending}件` : '',
    ]
      .filter(Boolean)
      .join(' · ')
  }

  const firstLine = (e: Entry) => e.progress.now.split('\n')[0]

  const checklist = (e: Entry) => {
    const issue = Number(e.progress.issue)
    const tested = Boolean(runCommand([`ls -1 ${e.path}/${TEST_RUN_DIR} 2>/dev/null | head -1`]))
    const pr = openPrs.find((p) => p.issue === issue)
    const box = (done: boolean) => (done ? '[x]' : '[ ]')

    return [
      `${box(e.progress.done.length > 0)} 実装`,
      `${box(tested)} test`,
      `${box(Boolean(pr))} PR`,
      `${box(Boolean(pr) && !unresolved.has(issue))} 指摘対応`,
    ].join(' · ')
  }

  const heading = (label: string) =>
    `### ${label} ${'─'.repeat(Math.max(4, RULE_WIDTH - displayWidth(label)))}`

  const card = (e: Entry): string => {
    const { mark, kind, action } = nextAction(e)

    return [
      heading(`${mark} ${e.name} · ${meta(e)}`),
      reviewing.has(Number(e.progress.issue)) ? '' : checklist(e),
      e.progress.now ? truncate(firstLine(e), NOW_WIDTH * 2) : '',
      e.progress.questions.map((q, i) => `${i + 1}. ${q}`).join('\n'),
      action ? `→ ${kind}: ${action}` : '→ 自動で進む',
    ]
      .filter(Boolean)
      .join('\n\n')
  }

  const needsAction = entries.filter((e) => nextAction(e).rank < 9).length

  const sorted = [...entries].sort((a, b) => nextAction(a).rank - nextAction(b).rank)
  const acting = sorted.filter((e) => nextAction(e).rank < 9)
  const running = sorted.filter((e) => nextAction(e).rank === 9)

  const conflicts = github.filter(({ kind }) => kind.includes('conflict'))
  const queuedPrs = github.filter(({ kind }) => !kind.includes('conflict'))

  const status = [
    `**要アクション ${needsAction + conflicts.length}件**`,
    `自動進行 ${running.length + queuedPrs.length}件`,
    queued.length ? `未消化の依頼 ${queued.length}件` : '',
    testing ? `テスト実行中 ${testing.name}` : '',
  ]
    .filter(Boolean)
    .join(' ／ ')

  const summary = [
    status,
    ...acting.map(card),
    ...conflicts.map(({ pr }) =>
      [
        heading(`◐ PR #${pr.number} · \`conflict with ${BASE_BRANCH}\` · worktree なし`),
        `→ 取り込み承認待ち: \`/board ${pr.issue} ${BASE_BRANCH} を取り込んで…\` と指示する`,
      ].join('\n\n'),
    ),
    ...running.map(card),
    ...queuedPrs.map(({ pr, kind }) =>
      [heading(`○ PR #${pr.number} · \`${kind}\``), '→ 優先度が回れば dispatch が着手'].join('\n\n'),
    ),
  ]
    .filter(Boolean)
    .join('\n\n')

  const request = input.trim().match(/^(!?)\s*\S*?(\d+)\S*\s+([\s\S]+)$/)
  if (!request) return summary

  // ─── Phase 3: 依頼の登録 ───────────────────────────────────
  phase('依頼の登録')

  const [, bang, number, message] = request
  const issue = Number(number)
  const force = bang === '!'
  const entry = entries.find((e) => e.progress.issue === `${issue}`)

  writeQueue([
    ...queued,
    { issue, message, force, requestedAt: runCommand(['date -u +%FT%TZ'])?.trim() ?? '' },
  ])

  return [
    summary,
    heading(`${entry?.name ?? `#${issue}`} へ依頼を積みました`),
    message,
    `次の dispatch-work で送信されます${force ? '（talking 中でも割り込みます）' : ''}`,
  ].join('\n\n')
}

respond(board(parseArgs()))

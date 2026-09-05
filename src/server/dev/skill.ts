import {
  DEV_COMMAND,
  DEV_PORTS,
  DEV_STOP_COMMAND,
  PROJECT_ROOT,
  TICKET_PREFIX,
} from '../../../local/project.js'
import { getArgs } from '../../shared/args.js'
import { type Schema, readFile, respond, runCommand, writeFile } from '../../shared/complete.js'
import { gitIsWorktree } from '../../shared/git.js'
import type { Infer } from '../../shared/infer.js'
import { dedent } from '../../shared/utils.js'
import { STATE_PATH } from '../../server/check/skill.js'

const LOG_PATH = '.claude/local/dev-server.log'

type State = {
  cwd: string
  label: string
  startedAt: string
} | null

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    target: {
      type: ['string', 'null'],
      description:
        'string: 起動・切り替え対象。worktree名（"{TICKET_PREFIX}-番号" 形式）・ブランチ名・issue番号のいずれか, null: ステータス表示のみ（起動/停止は行わない）',
    },
  },
  required: ['target'],
} as const satisfies Schema

function readState(): State {
  const content = readFile(`${PROJECT_ROOT}/${STATE_PATH}`)
  return content ? JSON.parse(content) : null
}

function isAlive(): boolean {
  if (DEV_PORTS.length === 0) return false
  const pattern = DEV_PORTS.map((p) => `:${p} `).join('|')
  return runCommand([`ss -ltn 2>/dev/null | grep -E '${pattern}' >/dev/null && echo up || echo down`]) === 'up'
}

type WorktreeEntry = { path: string; branch: string | null; label: string; isMain: boolean }

function listWorktreeEntries(): WorktreeEntry[] {
  const list = runCommand([`git -C ${PROJECT_ROOT} worktree list --porcelain`]) || ''
  const entries: { path: string; branch: string | null }[] = []
  let current: { path: string; branch: string | null } | null = null

  for (const line of list.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current) entries.push(current)
      current = { path: line.slice('worktree '.length).trim(), branch: null }
    } else if (line.startsWith('branch ') && current) {
      current.branch = line.slice('branch '.length).trim().replace(/^refs\/heads\//, '')
    }
  }
  if (current) entries.push(current)

  const mainName = PROJECT_ROOT.split('/').pop() ?? PROJECT_ROOT

  return entries.map((e) => {
    const isMain = !gitIsWorktree(e.path)
    return {
      ...e,
      isMain,
      label: isMain ? `${mainName} (main)` : (e.path.split('/').pop() ?? e.path),
    }
  })
}

function stopDevServer() {
  if (DEV_PORTS.length > 0) {
    const portsArg = DEV_PORTS.map((p) => `${p}/tcp`).join(' ')
    runCommand([`fuser -k -TERM ${portsArg} 2>/dev/null || true`])
  }

  for (const entry of listWorktreeEntries()) {
    const p = entry.path
    const pattern = p.length > 1 ? `[${p[0]}]${p.slice(1)}` : p
    runCommand([`pkill -TERM -f '${pattern}' 2>/dev/null || true`])
  }

  if (DEV_STOP_COMMAND) runCommand([DEV_STOP_COMMAND])
  runCommand(['sleep 1'])
}

function resolveCwd(target: string): { cwd: string; label: string } | null {
  const entries = listWorktreeEntries()

  const worktreeName = /^\d+$/.test(target) ? `${TICKET_PREFIX || 'issue'}-${target}` : target

  const wt = worktreeName.toLowerCase()
  const byLabel = entries.find((e) => {
    if (e.label.toLowerCase() === wt) return true
    if (e.isMain) {
      const basename = (PROJECT_ROOT.split('/').pop() ?? '').toLowerCase()
      return wt === basename || wt === 'main'
    }
    return false
  })
  if (byLabel) return { cwd: byLabel.path, label: byLabel.label }

  const byBranch = entries.find((e) => e.branch === target)
  if (byBranch) return { cwd: byBranch.path, label: byBranch.label }

  return null
}

function buildStatusTable(state: State, currentlyAlive: boolean): string {
  const entries = listWorktreeEntries()

  const rows = entries.map((e) => {
    const active = currentlyAlive && state?.cwd === e.path
    return `| ${active ? '🔵' : '⚪'} | ${e.label} | ${e.branch ?? '(detached)'} |`
  })

  return dedent`
    | | worktree | ブランチ |
    |---|---|---|
    ${rows.join('\n')}
  `
}

export function devServer(args: Infer<typeof ARGS_SCHEMA>): string {
  const { target } = args

  // ─── Phase 1: 現在の状態を取得 ───────────────────────────────
  phase('現在の状態を取得')

  const state = readState()
  const currentlyAlive = isAlive()

  // ─── Phase 2: target 無し → ステータス表示のみ ───────────────
  if (!target) {
    phase('ステータス表示')

    const table = buildStatusTable(state, currentlyAlive)

    if (currentlyAlive && !state) {
      return dedent`
        ${table}

        dev サーバーは起動していますが、このスキル外で起動されたものかもしれません（記録された worktree がありません）
      `
    }

    if (!state) return table

    const recentLog = runCommand([`tail -n 20 ${PROJECT_ROOT}/${LOG_PATH}`]) || '(ログなし)'

    if (!currentlyAlive) {
      return dedent`
        ${table}

        ${state.label} の dev サーバーは停止しています

        直近のログ（${LOG_PATH}）:
        ${recentLog}
      `
    }

    return dedent`
      ${table}

      起動時刻: ${state.startedAt} / ログ: ${LOG_PATH}

      直近のログ:
      ${recentLog}
    `
  }

  // ─── Phase 3: target 解決 ────────────────────────────────────
  phase('target 解決')

  const resolved = resolveCwd(target)
  if (!resolved) return `"${target}" に一致する worktree / ブランチが見つかりませんでした`

  // ─── Phase 4: 既存の dev サーバーを停止 ──────────────────────
  phase('既存の dev サーバーを停止')

  const stoppedMessage = currentlyAlive ? `${state?.label ?? '既存の dev サーバー'} を停止し、` : ''
  stopDevServer()

  // ─── Phase 5: 新しい dev サーバーを起動 ──────────────────────
  phase('新しい dev サーバーを起動')

  runCommand([`: > ${PROJECT_ROOT}/${LOG_PATH}`])
  runCommand([
    `cd ${resolved.cwd} && setsid bash -c '${DEV_COMMAND}' >> ${PROJECT_ROOT}/${LOG_PATH} 2>&1 < /dev/null &`,
  ])
  const startedAt = runCommand(['date -u +%FT%TZ']) || ''

  writeFile(
    `${PROJECT_ROOT}/${STATE_PATH}`,
    JSON.stringify({ cwd: resolved.cwd, label: resolved.label, startedAt }, null, 2),
  )

  const newTable = buildStatusTable({ cwd: resolved.cwd, label: resolved.label, startedAt }, true)

  return dedent`
    ${stoppedMessage}${resolved.label} で dev サーバーを起動しました（ログ: ${LOG_PATH}）

    ${newTable}
  `
}

respond(devServer(getArgs(ARGS_SCHEMA)))

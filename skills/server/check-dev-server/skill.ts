import { DEV_PORTS, PROJECT_ROOT } from '../../../local/project.js'
import { getArgs } from '../../_shared/args.js'
import { type Schema, readFile, respond, runCommand } from '../../_shared/complete.js'
import { gitIsWorktree } from '../../_shared/git.js'
import type { Infer } from '../../_shared/infer.js'

export const STATE_PATH = '.claude/local/dev-server-state.json'

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    workingDir: {
      type: 'string',
      description: 'dev サーバーを必要としている作業ディレクトリ（worktree のパスまたは PROJECT_ROOT）',
    },
  },
  required: ['workingDir'],
} as const satisfies Schema

export const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    isWorktree: {
      type: 'boolean',
      description: 'workingDir が PROJECT_ROOT 本体ではなく worktree かどうか',
    },
    ready: {
      type: 'boolean',
      description: 'workingDir を指す dev サーバーが既に起動しており、そのまま検証できる状態か',
    },
    canStart: {
      type: 'boolean',
      description:
        'このディレクトリで自分から dev サーバーを起動してよいか。worktree では常に false（親が一括管理するため）',
    },
    runningFor: {
      type: ['string', 'null'],
      description: 'string: 現在 dev サーバーが起動している worktree のパス, null: 起動していない場合',
    },
    reason: {
      type: 'string',
      description: 'ready が false の場合に、呼び出し側がそのまま提示できる理由・対処方法',
    },
  },
  required: ['isWorktree', 'ready', 'canStart', 'runningFor', 'reason'],
} as const satisfies Schema

type DevServerState = { cwd: string; label: string; startedAt: string } | null

function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

function resolveDir(workingDir: string): string {
  const resolved = runCommand([`cd "${workingDir}" && pwd`])
  return normalize(resolved?.trim() || workingDir)
}

function isAlive(): boolean {
  if (DEV_PORTS.length === 0) return false
  const pattern = DEV_PORTS.map((p) => `:${p} `).join('|')
  return (
    runCommand([`ss -ltn 2>/dev/null | grep -E '${pattern}' >/dev/null && echo up || echo down`]) ===
    'up'
  )
}

export function checkDevServer(args: Infer<typeof ARGS_SCHEMA>): Infer<typeof RESULT_SCHEMA> {
  const workingDir = resolveDir(args.workingDir)
  const projectRoot = normalize(PROJECT_ROOT)
  const isWorktree = gitIsWorktree(workingDir)

  const raw = readFile(`${projectRoot}/${STATE_PATH}`)
  const state: DevServerState = raw ? JSON.parse(raw) : null
  const alive = isAlive()
  const runningFor = alive && state ? normalize(state.cwd) : null

  if (alive && runningFor === workingDir)
    return { isWorktree, ready: true, canStart: false, runningFor, reason: '' }

  if (isWorktree)
    return {
      isWorktree,
      ready: false,
      canStart: false,
      runningFor,
      reason: runningFor
        ? `dev サーバーは ${runningFor} で起動中のため、この worktree では使えません（worktree からは起動しません）\n親リポジトリで dev-server スキルを ${workingDir} に切り替えてから再実行してください`
        : `dev サーバーが起動していません（worktree からは起動しません）\n親リポジトリで dev-server スキルを ${workingDir} 向けに起動してから再実行してください`,
    }

  return {
    isWorktree,
    ready: false,
    canStart: true,
    runningFor,
    reason: runningFor
      ? `dev サーバーは ${runningFor} で起動中です。このディレクトリ向けに起動し直してください`
      : 'dev サーバーが起動していません。このディレクトリで起動できます',
  }
}

respond(checkDevServer(getArgs(ARGS_SCHEMA)))

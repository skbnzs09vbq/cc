import { PROJECT_ROOT } from '../../local/project.js'
import { getArgs } from '../shared/args.js'
import { type Schema, readFile, respond, runCommand, writeFile } from '../shared/complete.js'
import type { Infer } from '../shared/infer.js'
import { DISPATCH_QUEUE_PATH } from '../shared/paths.js'
import { boxTable, dedent, truncate } from '../shared/utils.js'

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['add', 'list', 'clear'],
      description: 'add: 依頼を積む, list: 未消化の依頼を表示する, clear: issue の依頼を取り消す',
    },
    issue: {
      type: ['integer', 'null'],
      description: 'integer: 依頼先の issue 番号, null: action が list の場合',
    },
    message: {
      type: ['string', 'null'],
      description:
        'string: 送りたい内容。"/implement ..." のようなスラッシュコマンドでも自由文でもよい, null: add 以外',
    },
    force: {
      type: 'boolean',
      description:
        'true: 対象が talking（user と会話中）でも送る, false: talking の間は送らず次の機会を待つ',
    },
  },
  required: ['action', 'issue', 'message', 'force'],
} as const satisfies Schema

export type QueuedRequest = {
  issue: number
  message: string
  force: boolean
  requestedAt: string
}

const MESSAGE_WIDTH = 40

const QUEUE_FILE = `${PROJECT_ROOT}/${DISPATCH_QUEUE_PATH}`

export function readQueue(): QueuedRequest[] {
  const raw = readFile(QUEUE_FILE)
  return raw ? JSON.parse(raw) : []
}

export function writeQueue(queue: QueuedRequest[]) {
  writeFile(QUEUE_FILE, JSON.stringify(queue, null, 2))
}

export function request(args: Infer<typeof ARGS_SCHEMA>): string {
  const { action, issue, message, force } = args

  // ─── Phase 1: 現在のキュー読み込み ─────────────────────────
  phase('現在のキュー読み込み')

  const queue = readQueue()

  // ─── Phase 2: 操作 ─────────────────────────────────────────
  phase('操作')

  if (action === 'list') {
    if (queue.length === 0) return '未消化の依頼はありません'

    return dedent`
      ## 未消化の依頼（${queue.length}件）

      ${boxTable(
        ['issue', 'force', 'requested', 'message'],
        queue.map((q) => [
          `${q.issue}`,
          q.force ? 'yes' : '-',
          q.requestedAt.replace('T', ' ').replace('Z', ''),
          q.message.split('\n')[0].slice(0, 50),
        ]),
      )}

      次の dispatch-work（最大10分後）で消化されます
      すぐ消化したい場合は、親セッションで /dispatch-work を1回実行してください
    `
  }

  if (action === 'clear') {
    const remaining = queue.filter((q) => q.issue !== issue)
    writeQueue(remaining)
    return `issue #${issue} の依頼を ${queue.length - remaining.length} 件取り消しました`
  }

  const entry: QueuedRequest = {
    issue: issue as number,
    message: message as string,
    force,
    requestedAt: runCommand(['date -u +%FT%TZ'])?.trim() ?? '',
  }

  writeQueue([...queue, entry])

  return dedent`
    issue #${entry.issue} への依頼を積みました（未消化 ${queue.length + 1} 件）

    ${entry.message}

    次の dispatch-work で送信されます${force ? '（talking 中でも割り込みます）' : ''}
  `
}

respond(request(getArgs(ARGS_SCHEMA)))

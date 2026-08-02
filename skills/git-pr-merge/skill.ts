import { getArgs } from '../_shared/args.js'
import { type Schema, respond, runCommand } from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    workingDir: { type: 'string', description: 'マージを実行するディレクトリ' },
    prNumber: { type: 'integer', description: '対象 PR 番号' },
  },
  required: ['workingDir', 'prNumber'],
} as const satisfies Schema

export const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    merged: { type: 'boolean', description: 'マージが成功したか' },
    conflict: {
      type: 'boolean',
      description: 'merged が false の場合、base ブランチとのコンフリクトが原因か',
    },
    message: { type: 'string', description: '成功/失敗の詳細（エラーメッセージ・状況説明）' },
  },
  required: ['merged', 'conflict', 'message'],
} as const satisfies Schema

export function gitPrMerge(args: Infer<typeof ARGS_SCHEMA>): Infer<typeof RESULT_SCHEMA> {
  const { workingDir, prNumber } = args

  const mergeResult = runCommand([`cd ${workingDir} && gh pr merge ${prNumber} --squash`])
  const statusRaw = runCommand([`gh pr view ${prNumber} --json state,mergeable`])
  const status = JSON.parse(statusRaw || '{}') as { state?: string; mergeable?: string }

  if (status.state === 'MERGED') {
    return { merged: true, conflict: false, message: mergeResult || 'マージに成功しました' }
  }
  if (status.mergeable === 'CONFLICTING') {
    return { merged: false, conflict: true, message: 'base ブランチとコンフリクトしています' }
  }
  return {
    merged: false,
    conflict: false,
    message: mergeResult || `state: ${status.state}, mergeable: ${status.mergeable}`,
  }
}

respond(gitPrMerge(getArgs(ARGS_SCHEMA)))

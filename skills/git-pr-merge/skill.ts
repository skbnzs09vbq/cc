import { getArgs } from '../_shared/args.js'
import { type Schema, complete, respond, runCommand } from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'
import { dedent } from '../_shared/utils.js'

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
  const status = runCommand([`gh pr view ${prNumber} --json state,mergeable`])

  return complete(
    dedent`
      以下の gh pr merge 実行結果と、マージ後の PR 状態から判定してください。

      merge 実行結果:
      ${mergeResult}

      PR 状態（state, mergeable）:
      ${status}

      state が MERGED なら merged:true, conflict:false。
      それ以外で mergeable が CONFLICTING なら merged:false, conflict:true。
      それ以外なら merged:false, conflict:false とし、message に理由を入れてください。
    `,
    RESULT_SCHEMA,
  )
}

respond(gitPrMerge(getArgs(ARGS_SCHEMA)))

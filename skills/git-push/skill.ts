import { getArgs } from '../_shared/args.js'
import { type Schema, respond, runCommand } from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    workingDir: { type: 'string', description: 'git push を実行するディレクトリ' },
    branch: { type: 'string', description: 'push するブランチ名' },
  },
  required: ['workingDir', 'branch'],
} as const satisfies Schema

export function gitPush(args: Infer<typeof ARGS_SCHEMA>): string | null {
  const { workingDir, branch } = args
  return runCommand([`cd ${workingDir} && git push -u origin ${branch}`])
}

respond(gitPush(getArgs(ARGS_SCHEMA)))

import { gitBranchName } from '../git-branch-name/skill.js'
import { getArgs } from '../_shared/args.js'
import { type Schema, askUser, exit, respond, runCommand } from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    workingDir: { type: 'string', description: 'ブランチ作成を実行するディレクトリ' },
    branchName: {
      type: ['string', 'null'],
      description: '作成するブランチ名。未定なら null',
    },
    baseBranch: {
      type: ['string', 'null'],
      description: '分岐元ブランチ名。workDescription 中に明記があればそれ、なければ null',
    },
    workDescription: {
      type: ['string', 'null'],
      description: 'branchName が null の場合に、ブランチ名を決めるための作業内容の説明',
    },
  },
  required: ['workingDir', 'branchName', 'baseBranch', 'workDescription'],
} as const satisfies Schema

export function gitBranchCreate(args: Infer<typeof ARGS_SCHEMA>): {
  branchName: string
  baseBranch: string | null
} {
  const { workingDir, baseBranch, workDescription } = args
  let { branchName } = args

  if (!branchName) {
    const description =
      workDescription ?? askUser('ブランチ名を決めるための作業内容を教えてください')
    if (!description) exit('branchName を決めるための作業内容が得られませんでした')
    branchName = gitBranchName({ workDescription: description, single: true })
  }

  runCommand(
    baseBranch
      ? [`cd ${workingDir} && git fetch origin && git switch -c ${branchName} origin/${baseBranch}`]
      : [`cd ${workingDir} && git switch -c ${branchName}`],
  )

  return { branchName, baseBranch }
}

respond(gitBranchCreate(getArgs(ARGS_SCHEMA)))

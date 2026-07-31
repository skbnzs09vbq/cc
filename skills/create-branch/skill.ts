import { getArgs } from '../_shared/args.js'
import { type Schema, askUser, complete, respond, runCommand } from '../_shared/complete.js'
import { dedent } from '../_shared/utils.js'

const ARGS_SCHEMA: Schema = {
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
}

const {
  workingDir,
  branchName: inputBranchName,
  baseBranch,
  workDescription,
} = getArgs<{
  workingDir: string
  branchName: string | null
  baseBranch: string | null
  workDescription: string | null
}>(ARGS_SCHEMA)

let branchName = inputBranchName
if (!branchName) {
  const description = workDescription ?? askUser('ブランチ名を決めるための作業内容を教えてください')
  const candidates = Skill('create-branch-name', description)
  branchName = complete<string>(
    dedent`
      以下の候補から最も適切な1つを選んでください
      実装内容が読み取りにくくても、"chore/add-placeholder" のような汎用名は選ばないこと

      ${candidates}
    `,
    { type: 'string', description: '選んだブランチ名' },
  )
}

runCommand(
  baseBranch
    ? [`cd ${workingDir} && git fetch origin && git switch -c ${branchName} origin/${baseBranch}`]
    : [`cd ${workingDir} && git switch -c ${branchName}`],
)

respond({ branchName, baseBranch })

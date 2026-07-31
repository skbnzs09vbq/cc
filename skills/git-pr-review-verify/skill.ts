import { TARGET_REPO } from '../../local/project.js'
import { getArgs } from '../_shared/args.js'
import { type Schema, complete, respond, runCommand } from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'
import { dedent } from '../_shared/utils.js'

const REPO = TARGET_REPO.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '')
const [OWNER, NAME] = REPO.split('/')

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    workingDir: { type: 'string', description: '確認を行うディレクトリ' },
    prNumber: { type: 'integer', description: '対象 PR 番号' },
  },
  required: ['workingDir', 'prNumber'],
} as const satisfies Schema

export const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    allAddressed: {
      type: 'boolean',
      description: '未解決だったレビュースレッドすべてに、最新コミットが対応できているか',
    },
    message: {
      type: 'string',
      description: '対応済みなら概要、未対応・不十分な指摘が残っていればその内容',
    },
  },
  required: ['allAddressed', 'message'],
} as const satisfies Schema

export function gitPrReviewVerify(args: Infer<typeof ARGS_SCHEMA>): Infer<typeof RESULT_SCHEMA> {
  const { workingDir, prNumber } = args

  const threads = runCommand([
    dedent`
      gh api graphql -f query='
        query {
          repository(owner: "${OWNER}", name: "${NAME}") {
            pullRequest(number: ${prNumber}) {
              reviewThreads(first: 100) {
                nodes {
                  id
                  isResolved
                  comments(first: 20) {
                    nodes { path body author { login } }
                  }
                }
              }
            }
          }
        }
      '
    `,
  ])

  const log = runCommand([`cd ${workingDir} && git log --oneline -20`])

  return complete(
    dedent`
      以下は PR #${prNumber} のレビュースレッド一覧（isResolved:false のものが確認対象）と、
      最新のコミットログです

      未解決の各スレッドについて、必要に応じて対象ファイルの現在の内容を確認したうえで、
      最新のコミットで指摘に対応できているか判定してください
      - 修正が完全か（ファイル操作・ロジック・テスト等）、対応後に新しい問題が無いかも確認する
      - 対応済みと判断できたスレッドは、実際に以下の mutation を実行して resolved にしてください:
        gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "<該当スレッドのid>"}) { thread { isResolved } } }'

      すべてのスレッドが対応済み（または元々 resolved 済み）なら allAddressed:true としてください
      1件でも未対応・不十分な指摘が残っていれば allAddressed:false とし、message にその内容を記載してください

      レビュースレッド一覧:
      ${threads}

      最新のコミットログ（作業ディレクトリ: ${workingDir}）:
      ${log}
    `,
    RESULT_SCHEMA,
  )
}

respond(gitPrReviewVerify(getArgs(ARGS_SCHEMA)))

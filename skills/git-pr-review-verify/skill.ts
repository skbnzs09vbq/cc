import { getArgs } from '../_shared/args.js'
import { type Schema, complete, respond, runCommand } from '../_shared/complete.js'
import { gitPrReviewThreads } from '../_shared/git.js'
import type { Infer } from '../_shared/infer.js'
import { dedent } from '../_shared/utils.js'

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

  const threads = gitPrReviewThreads(prNumber, true)

  const log = runCommand([`cd ${workingDir} && git log --oneline -20`])

  return complete(
    dedent`
      以下は PR #${prNumber} のレビュースレッド一覧（isResolved:false のものが確認対象）と、
      最新のコミットログです

      未解決の各スレッドについて、必要に応じて対象ファイルの現在の内容を確認したうえで、
      最新のコミットで指摘に対応できているか判定してください
      - 修正が完全か（ファイル操作・ロジック・テスト等）、対応後に新しい問題が無いかも確認する
      - 対応済みと判断できたスレッドは、まず該当スレッドに何を・なぜ直したかを説明する返信を
        インラインコメントとして投稿し、その後 resolved にしてください（順に実行）:
        1. gh api graphql -f query='mutation { addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: "<該当スレッドのid>", body: "<対応内容の説明>"}) { comment { id } } }'
        2. gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "<該当スレッドのid>"}) { thread { isResolved } } }'

      レビュースレッド一覧:
      ${threads}

      最新のコミットログ（作業ディレクトリ: ${workingDir}）:
      ${log}
    `,
    RESULT_SCHEMA,
  )
}

respond(gitPrReviewVerify(getArgs(ARGS_SCHEMA)))

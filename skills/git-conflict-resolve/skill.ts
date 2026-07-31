import { BASE_BRANCH } from '../../local/project.js'
import { getArgs } from '../_shared/args.js'
import { type Schema, complete, remember, respond, runCommand } from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'
import { dedent } from '../_shared/utils.js'
import { testVisualDiff } from '../test-visual-diff/skill.js'

const MAX_VISUAL_CHECK_ATTEMPTS = 3

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    workingDir: { type: 'string', description: 'コンフリクト解消を行うディレクトリ' },
    baseBranch: {
      type: ['string', 'null'],
      description: '取り込む分岐元ブランチ名\n未指定なら project.ts の BASE_BRANCH',
    },
    force: {
      type: 'boolean',
      description:
        'true の場合、安全に両立できないと判断した場合でも無理に解消を試み、必ず resolved:true にする（諦める選択肢を与えない）',
    },
    visualCheckUrl: {
      type: ['string', 'null'],
      description:
        'マージ前後で視覚的デグレが無いか確認するページ\nnull なら視覚チェックを行わない',
    },
    serverCommand: {
      type: ['string', 'null'],
      description: '視覚チェック用の開発サーバー起動コマンド\n不要なら null',
    },
    port: {
      type: ['integer', 'null'],
      description: '視覚チェック用サーバーのポート番号\nserverCommand がある場合は必須',
    },
  },
  required: ['workingDir', 'baseBranch', 'force', 'visualCheckUrl', 'serverCommand', 'port'],
} as const satisfies Schema

export const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    resolved: { type: 'boolean', description: 'コンフリクトを解消し push まで完了できたか' },
    message: { type: 'string', description: '解消できた内容、または解消を見送った理由' },
  },
  required: ['resolved', 'message'],
} as const satisfies Schema

const RESOLVE_STEP_SCHEMA = {
  type: 'object',
  properties: {
    committed: {
      type: 'boolean',
      description: 'コンフリクトを解消し commit まで完了できたか（push はまだ行わない）',
    },
    message: { type: 'string' },
  },
  required: ['committed', 'message'],
} as const satisfies Schema

export function gitConflictResolve(args: Infer<typeof ARGS_SCHEMA>): Infer<typeof RESULT_SCHEMA> {
  const { workingDir, force, visualCheckUrl, serverCommand, port } = args
  const baseBranch = args.baseBranch ?? BASE_BRANCH

  remember([
    'コンフリクト解消は、現在の実装と取り込み元（origin/baseBranch側）、どちらの機能も失わずに両立させる（片方を採用して他方を捨てない）',
    force
      ? '諦める選択肢は無い\n両立が難しくても、最も適切と判断できる形で必ず commit まで完了させること'
      : '安全に両立できないと判断した場合のみ、無理に解消せず committed:false として理由を返すこと',
    'このステップでは git push を行わないこと（push は呼び出し元が最後にまとめて行う）',
  ])

  const preMergeRef = runCommand([`cd ${workingDir} && git rev-parse HEAD`])
  runCommand([`cd ${workingDir} && git fetch origin`])
  const mergeResult = runCommand([`cd ${workingDir} && git merge origin/${baseBranch}`])

  let step = complete(
    dedent`
      "cd ${workingDir} && git merge origin/${baseBranch}" の実行結果です
      コンフリクトが無ければそのまま、あれば両立する形で解消したうえで、
      git add・git commit（差分があれば）を実行し committed:true としてください
      ${force ? '' : '安全に両立できない場合のみ git merge --abort し、committed:false, message に理由を入れてください'}

      実行結果:
      ${mergeResult}
    `,
    RESOLVE_STEP_SCHEMA,
  )

  if (!step.committed) {
    return { resolved: false, message: step.message }
  }

  let regressionFree = true
  if (visualCheckUrl && !preMergeRef) {
    step = {
      committed: step.committed,
      message: `${step.message}（マージ前のHEADが取得できなかったため視覚デグレ確認はスキップしました）`,
    }
  } else if (visualCheckUrl && preMergeRef) {
    regressionFree = false
    for (let attempt = 1; attempt <= MAX_VISUAL_CHECK_ATTEMPTS; attempt++) {
      const check = testVisualDiff({
        workingDir,
        refA: preMergeRef,
        refB: 'HEAD',
        url: visualCheckUrl,
        serverCommand,
        port,
        expectDiff: false,
        expectedArea: null,
      })

      if (check.matchesExpectation) {
        regressionFree = true
        break
      }

      step = {
        committed: step.committed,
        message: `視覚デグレを検知（${attempt}回目）: ${check.findings}`,
      }
      if (attempt === MAX_VISUAL_CHECK_ATTEMPTS) break

      step = complete(
        dedent`
          マージ後の実装で、視覚的デグレ（マージ前後で見た目が変わってはいけない箇所の差分）が検知されました
          現在の実装を見直し、デグレを解消するように該当ファイルを修正してください
          修正できたら git add・git commit を実行し、committed:true としてください（push はまだ行わない）

          デグレ内容:
          ${check.findings}
        `,
        RESOLVE_STEP_SCHEMA,
      )

      if (!step.committed) break
    }
  }

  if (!regressionFree && !force) {
    runCommand([`cd ${workingDir} && git reset --hard ${preMergeRef}`])
    return {
      resolved: false,
      message: `視覚デグレを${MAX_VISUAL_CHECK_ATTEMPTS}回の修正でも解消できませんでした: ${step.message}`,
    }
  }

  runCommand([`cd ${workingDir} && git push`])
  return {
    resolved: true,
    message: regressionFree
      ? step.message
      : `視覚デグレが残ったまま強制的に解消しました（force指定）: ${step.message}`,
  }
}

respond(gitConflictResolve(getArgs(ARGS_SCHEMA)))

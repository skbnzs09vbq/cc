import { gitBranchName } from '../git-branch-name/skill.js'
import { BASE_BRANCH } from '../../local/project.js'
import { parseArgs } from '../_shared/args.js'
import { type Schema, complete, remember, respond, runCommand } from '../_shared/complete.js'
import { dedent } from '../_shared/utils.js'

const PLAN_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    issueId: { type: 'string' },
    planContent: { type: 'string' },
  },
  required: ['issueId', 'planContent'],
} as const satisfies Schema

const BASE_BRANCH_SCHEMA = {
  type: 'object',
  properties: {
    baseBranch: {
      type: ['string', 'null'],
      description: '実装計画に分岐元として明記されているブランチがあればその名前。無ければ null',
    },
  },
  required: ['baseBranch'],
} as const satisfies Schema

export function issue(issueInput: string): string {
  remember([
    'タスク管理ツールは読み取りのみ行うこと（更新・コメント等は行わない）',
    'git commit, git push は、ユーザーの明示的な許可を得てから実行すること',
    'PR は作成しないこと',
  ])

  // ─── Phase 1: 計画立案 ─────────────────────────────────────────
  phase('計画立案')

  const planResult: string = Skill('plan-issue', issueInput)

  const plan = complete(
    `以下の plan-issue の結果から issueId・planContent を抽出してください。\n\n${planResult}`,
    PLAN_RESULT_SCHEMA,
  )

  // ─── Phase 2: ブランチ作成 ───────────────────────────────────
  phase('ブランチ作成')

  const branchName = gitBranchName({ workDescription: plan.planContent, single: true })

  const { baseBranch } = complete(
    dedent`
      以下の実装計画に分岐元として明記されているブランチがあれば baseBranch に、なければ null を返してください。

      実装計画:
      ${plan.planContent}
    `,
    BASE_BRANCH_SCHEMA,
  )

  const base = baseBranch || BASE_BRANCH

  runCommand(['git fetch origin', `git switch -c ${branchName} origin/${base}`])

  // ─── Phase 3: 実装 ──────────────────────────────────────────────
  phase('実装')

  Skill('implement', plan.planContent)

  // ─── Phase 4: 自己レビュー・E2E 検証（両方問題なくなるまで繰り返す） ─
  phase('自己レビュー・E2E検証')

  let clean = false
  while (!clean) {
    const reviewResult: { clean: boolean; findings: string | null } = Skill(
      'review-diff',
      JSON.stringify({ workingDir: '.', mode: 'check' }),
    )

    const e2eResult: { clean: boolean; findings: string | null } = Skill(
      'e2e-test',
      JSON.stringify({
        workingDir: '.',
        description: `${plan.issueId} の実装内容（${plan.planContent}）が正しく動作するか、変更箇所を中心に検証する。`,
        serverCommand: null,
        port: null,
      }),
    )

    clean = reviewResult.clean && e2eResult.clean

    if (!clean) {
      const findings = [reviewResult.findings, e2eResult.findings].filter(Boolean).join('\n\n')
      Skill('implement', findings)
    }
  }

  return `${plan.issueId} 対応完了（実装 → 自己レビュー・E2E 検証まで完了）`
}

respond(issue(parseArgs()))

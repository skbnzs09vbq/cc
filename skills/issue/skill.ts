import { dedent } from '../_shared/utils.js'
import { complete, runCommand, remember, respond, Schema } from '../_shared/complete.js'
import { parseArgs } from '../_shared/args.js'
import { BASE_BRANCH } from '../../local/project.js'

remember([
  'タスク管理ツールは読み取りのみ行うこと（更新・コメント等は行わない）',
  'git commit, git push は、ユーザーの明示的な許可を得てから実行すること',
  'PR は作成しないこと',
])

const issueInput = parseArgs()

// ─── Phase 1: 計画立案 ─────────────────────────────────────────
phase('計画立案')

const planResult: string = Skill("plan-issue", issueInput)

const PLAN_RESULT_SCHEMA: Schema = {
  type: 'object',
  properties: {
    issueId:     { type: 'string' },
    planContent: { type: 'string' },
  },
  required: ['issueId', 'planContent'],
}

const plan = complete(`以下の plan-issue の結果から issueId・planContent を抽出してください。\n\n${planResult}`, PLAN_RESULT_SCHEMA)

// ─── Phase 2: ブランチ作成 ───────────────────────────────────
phase('ブランチ作成')

const branchCandidates = Skill("create-branch-name", plan.planContent)

const BRANCH_SELECTION_SCHEMA: Schema = {
  type: 'object',
  properties: {
    branchName: {
      type: 'string',
      description: '候補の中から最適な1つを選んだブランチ名',
    },
    baseBranch: {
      type: ['string', 'null'],
      description: '実装計画に分岐元として明記されているブランチがあればその名前。無ければ null',
    },
  },
  required: ['branchName', 'baseBranch'],
}

const branchSelection = complete(
  dedent`
    以下のブランチ名候補から最適な1つを選んでください。
    また、以下の実装計画に分岐元として明記されているブランチがあれば baseBranch に、なければ null を返してください。

    候補:
    ${branchCandidates}

    実装計画:
    ${plan.planContent}
  `,
  BRANCH_SELECTION_SCHEMA
)

const base = branchSelection.baseBranch || BASE_BRANCH

runCommand(['git fetch origin', `git switch -c ${branchSelection.branchName} origin/${base}`])

// ─── Phase 3: 実装 ──────────────────────────────────────────────
phase('実装')

Skill("implement", plan.planContent)

// ─── Phase 4: 自己レビュー・E2E 検証（両方問題なくなるまで繰り返す） ─
phase('自己レビュー・E2E検証')

const CHECK_RESULT_SCHEMA: Schema = {
  type: 'object',
  properties: {
    clean: {
      type: 'boolean',
      description: '問題が一切ないかどうか',
    },
    findings: {
      type: ['string', 'null'],
      description: 'clean が false の場合の問題内容。true の場合は null',
    },
  },
  required: ['clean', 'findings'],
}

let clean = false
while (!clean) {
  const review = Skill("review-diff")
  const reviewResult = complete(`以下のレビュー結果を判定してください。\n\n${review}`, CHECK_RESULT_SCHEMA)

  const e2eReport = Skill("webapp-testing", `${plan.issueId} の実装内容（${plan.planContent}）が正しく動作するか、変更箇所を中心に検証してください。`)
  const e2eResult = complete(`以下の検証結果を判定してください。\n\n${e2eReport}`, CHECK_RESULT_SCHEMA)

  clean = reviewResult.clean && e2eResult.clean

  if (!clean) {
    const findings = [reviewResult.findings, e2eResult.findings].filter(Boolean).join('\n\n')
    Skill("implement", findings)
  }
}

respond(`${plan.issueId} 対応完了（実装 → 自己レビュー・E2E 検証まで完了）`)

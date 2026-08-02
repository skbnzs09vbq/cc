export const meta = {
  name: 'auto-dev-issue',
  description: 'issue を計画立案から実装・レビュー・PR作成まで自律的に対応する',
  phases: [
    { title: '計画立案' },
    { title: 'ブランチ作成' },
    { title: '実装' },
    { title: 'レビュー・E2E検証' },
    { title: 'コミット・PR作成' },
  ],
}

function dedent(strings, ...values) {
  const bodyLines = strings.flatMap(s => s.split('\n').slice(1)).filter(l => l.trim())
  const indent = bodyLines.length ? Math.min(...bodyLines.map(l => l.match(/^ */)[0].length)) : 0
  const strip = s => s.split('\n').map((l, i) => i === 0 ? l : (l.startsWith(' '.repeat(indent)) ? l.slice(indent) : l)).join('\n')
  return strings.reduce((acc, s, i) => acc + strip(s) + (i < values.length ? values[i] : ''), '').trim()
}

const AUTO_DEV_NOTE = 'auto-dev workflow からの実行です。ユーザー許可は得た上で呼び出されているので、確認を挟まず実行してください。'

function withNote(argsObj) {
  return `${AUTO_DEV_NOTE}\n\n${JSON.stringify(argsObj)}`
}

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    aborted: { type: 'boolean' },
    reason: { type: ['string', 'null'] },
    issueId: { type: ['string', 'null'] },
    planContent: { type: ['string', 'null'] },
  },
  required: ['aborted', 'reason', 'issueId', 'planContent'],
}

const BRANCH_SCHEMA = {
  type: 'object',
  properties: {
    branchName: { type: 'string' },
    baseBranch: {
      type: ['string', 'null'],
      description: '実装計画中に分岐元ブランチの明記があればそれを指定する、なければ null',
    },
  },
  required: ['branchName', 'baseBranch'],
}

const CHECK_SCHEMA = {
  type: 'object',
  properties: {
    clean: { type: 'boolean' },
    findings: { type: ['string', 'null'] },
  },
  required: ['clean', 'findings'],
}

const E2E_SCHEMA = {
  type: 'object',
  properties: {
    clean: { type: 'boolean' },
    findings: { type: ['string', 'null'] },
    screenshots: {
      type: 'array',
      items: { type: 'string' },
      description: '動作確認時に取得したスクリーンショットのファイルパス一覧（なければ空配列）',
    },
  },
  required: ['clean', 'findings', 'screenshots'],
}

const { issue, worktreePath, maxIterations } = typeof args === 'string' ? JSON.parse(args) : args

log(`issue #${issue.number} の対応を開始`)

// ─── Phase 1: 計画立案 ───────────────────────────────────────
phase('計画立案')

const plan = await agent(
  issue.url,
  { agentType: 'plan-issue', schema: PLAN_SCHEMA, phase: '計画立案', label: `issue #${issue.number}` }
)

if (plan.aborted || !plan.planContent) {
  const result = `issue #${issue.number} 中止: ${plan.reason ?? '計画内容が空でした（planContent なし）'}`
  log(result)
  return { result }
}

// ─── Phase 2: ブランチ作成 ───────────────────────────────────
phase('ブランチ作成')

const branch = await agent(
  JSON.stringify({
    workingDir: worktreePath,
    branchName: null,
    baseBranch: null,
    workDescription: `実装計画:\n${plan.planContent}`,
  }),
  { agentType: 'git-branch-create', schema: BRANCH_SCHEMA, phase: 'ブランチ作成', label: `issue #${issue.number}` }
)

// ─── Phase 3: 実装 ───────────────────────────────────────────
phase('実装')

await agent(
  JSON.stringify({ workingDir: worktreePath, input: plan.planContent }),
  { agentType: 'implement', phase: '実装', label: `issue #${issue.number}` }
)

// ─── Phase 4: レビュー・E2E検証 ─────────────────────────────
phase('レビュー・E2E検証')

let clean = false
let findings = null
let lastE2e = null
let fixCount = 0

for (let i = 0; i < maxIterations; i++) {
  const [review, e2e] = await parallel([
    () => agent(
      JSON.stringify({ workingDir: worktreePath }),
      { agentType: 'review-diff', schema: CHECK_SCHEMA, phase: 'レビュー・E2E検証', label: `issue #${issue.number} review${i + 1}` }
    ),
    () => agent(
      JSON.stringify({
        workingDir: worktreePath,
        description: `${plan.issueId} の実装内容が正しく動作するか、以下の計画をもとに検証する:\n${plan.planContent}`,
        serverCommand: null,
        port: null,
      }),
      { agentType: 'test-e2e', schema: E2E_SCHEMA, phase: 'レビュー・E2E検証', label: `issue #${issue.number} e2e${i + 1}` }
    ),
  ])
  lastE2e = e2e
  clean = review.clean && e2e.clean
  findings = [review.findings, e2e.findings].filter(Boolean).join('\n\n') || null

  if (clean) break

  fixCount++
  await agent(
    JSON.stringify({ workingDir: worktreePath, input: `指摘事項:\n${findings}` }),
    { agentType: 'implement', phase: 'レビュー・E2E検証', label: `issue #${issue.number} 修正${fixCount}` }
  )
}

// ─── Phase 5: コミット・PR作成 ─────────────────────────────
phase('コミット・PR作成')

await agent(
  withNote({ workingDir: worktreePath, message: null, body: null }),
  { agentType: 'git-commit', phase: 'コミット・PR作成', label: `issue #${issue.number} commit` }
)
await agent(
  withNote({ workingDir: worktreePath, branch: branch.branchName }),
  { agentType: 'git-push', phase: 'コミット・PR作成', label: `issue #${issue.number} push` }
)

const pr = await agent(
  withNote({
    workingDir: worktreePath,
    head: branch.branchName,
    base: branch.baseBranch,
    title: null,
    description: null,
    closesIssue: issue.number,
    screenshots: lastE2e.screenshots ?? [],
    workDescription: `実装計画:\n${plan.planContent}`,
    additionalBody: !clean ? `## 既知の指摘\n${findings}` : null,
  }),
  { agentType: 'git-pr-create', phase: 'コミット・PR作成', label: `issue #${issue.number} PR作成` }
)

const result = `${plan.issueId} 対応完了（PR: ${pr}）`
log(result)

return { result }

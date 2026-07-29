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
    baseBranch: { type: ['string', 'null'] },
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

const SCREENSHOT_NOTE = 'スクリーンショットは gh gist create などで公開 URL を取得し（gh api で raw_url を取得する等）、Markdown 画像として本文に埋め込んでください'

const COMMIT_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    body: { type: ['string', 'null'] },
  },
  required: ['message', 'body'],
}

const PR_DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
  },
  required: ['title', 'description'],
}

const { issue, worktreePath, maxIterations } = args
const WORKDIR_NOTE = `作業ディレクトリ: ${worktreePath}（git 操作はすべてこのディレクトリ内で行ってください）`

log(`issue #${issue.number} の対応を開始`)

// ─── Phase: 計画立案 ────────────────────────────────────────
phase('計画立案')

const plan = await agent(
  dedent`
    ${issue.url}

    完了したら issueId と planContent を返してください
  `,
  { agentType: 'plan-issue', schema: PLAN_SCHEMA, phase: '計画立案', label: `issue #${issue.number}` }
)

if (plan.aborted) {
  const result = `issue #${issue.number} 中止: ${plan.reason}`
  log(result)
  return { result }
}

// ─── Phase: ブランチ作成 ────────────────────────────────────
phase('ブランチ作成')

const branch = await agent(
  dedent`
    実装計画:
    ${plan.planContent}

    計画中に分岐元ブランチの明記があればそれを baseBranch に、なければ null にしてください
  `,
  { agentType: 'create-branch-name', schema: BRANCH_SCHEMA, phase: 'ブランチ作成', label: `issue #${issue.number}` }
)

await agent(
  dedent`
    ${WORKDIR_NOTE}

    ${branch.baseBranch
      ? `git fetch origin を実行し、git switch -c ${branch.branchName} origin/${branch.baseBranch} でブランチを作成してください`
      : `git switch -c ${branch.branchName} でブランチを作成してください（起点は既にチェックアウト済みの base ブランチ）`}
  `,
  { phase: 'ブランチ作成', label: `issue #${issue.number}` }
)

// ─── Phase: 実装 ────────────────────────────────────────
phase('実装')

await agent(
  dedent`
    ${WORKDIR_NOTE}

    実装計画:
    ${plan.planContent}
  `,
  { agentType: 'implement', phase: '実装', label: `issue #${issue.number}` }
)

// ─── Phase: レビュー・E2E検証 ────────────────────────────
phase('レビュー・E2E検証')

let clean = false
let findings = null
let lastE2e = null
let iterations = 0

while (!clean && iterations < maxIterations) {
  iterations++
  if (findings) {
    await agent(
      dedent`
        ${WORKDIR_NOTE}

        指摘事項:
        ${findings}
      `,
      { agentType: 'implement', phase: 'レビュー・E2E検証', label: `issue #${issue.number} 修正${iterations}` }
    )
  }
  const [review, e2e] = await parallel([
    () => agent(
      dedent`
        ${WORKDIR_NOTE}

        引数なしで実行してください
        指摘があれば clean:false と findings（指摘内容の要約）、指摘なしなら clean:true と findings:null を返してください
      `,
      { agentType: 'review-diff', schema: CHECK_SCHEMA, phase: 'レビュー・E2E検証', label: `issue #${issue.number} review${iterations}` }
    ),
    () => agent(
      dedent`
        ${WORKDIR_NOTE}

        ${plan.issueId} の実装内容が正しく動作するか、以下の計画をもとに検証してください
        検証中の要所でスクリーンショットを撮影し、ファイルパスの一覧を screenshots に含めてください

        計画:
        ${plan.planContent}

        問題があれば clean:false と findings（指摘内容の要約）、問題なしなら clean:true と findings:null を返してください
      `,
      { agentType: 'webapp-testing', schema: E2E_SCHEMA, phase: 'レビュー・E2E検証', label: `issue #${issue.number} e2e${iterations}` }
    ),
  ])
  lastE2e = e2e
  clean = review.clean && e2e.clean
  findings = [review.findings, e2e.findings].filter(Boolean).join('\n\n') || null
}

if (!clean && iterations >= maxIterations) {
  const result = `issue #${issue.number} 最大反復回数達成（完了していない可能性あり）`
  log(result)
  return { result }
}

// ─── Phase: コミット・PR作成 ────────────────────────────
phase('コミット・PR作成')

const commit = await agent(
  dedent`
    ${WORKDIR_NOTE}

    現在の差分からコミットメッセージを生成してください
  `,
  { agentType: 'create-commit-msg', schema: COMMIT_SCHEMA, phase: 'コミット・PR作成', label: `issue #${issue.number} commit` }
)
await agent(
  dedent`
    ${WORKDIR_NOTE}

    git add -A を実行し、以下の内容で git commit してください
    メッセージに改行・引用符が含まれる可能性があるため、安全な方法（コミットメッセージをファイルに書き出して git commit -F 等）で実行してください

    メッセージ: ${commit.message}
    ${commit.body ? `本文:\n${commit.body}` : ''}
  `,
  { phase: 'コミット・PR作成', label: `issue #${issue.number} commit` }
)
await agent(
  dedent`
    ${WORKDIR_NOTE}

    git push -u origin ${branch.branchName} を実行してください
  `,
  { phase: 'コミット・PR作成', label: `issue #${issue.number} push` }
)

const prDraft = await agent(
  dedent`
    実装計画:
    ${plan.planContent}
  `,
  { agentType: 'draft-pr-description', schema: PR_DRAFT_SCHEMA, phase: 'コミット・PR作成', label: `issue #${issue.number} PR文面` }
)
const pr = await agent(
  dedent`
    以下の内容で gh pr create を実行し、作成した PR の URL を返してください
    body に改行・引用符が含まれる可能性があるため、一時ファイルに書き出して --body-file で渡す等、安全な方法で実行してください
    body の先頭に "Closes #${issue.number}" を必ず含めてください（後から PR を検知した際に、元の issue との対応を追跡するため）
    ${lastE2e.screenshots?.length ? SCREENSHOT_NOTE : ''}

    base: ${branch.baseBranch || '.claude/local/project.ts の BASE_BRANCH'}
    head: ${branch.branchName}
    title: ${prDraft.title}

    body:
    Closes #${issue.number}

    ${prDraft.description}
    ${lastE2e.screenshots?.length ? `\nスクリーンショット（動作確認時に撮影したもの）:\n${lastE2e.screenshots.join('\n')}` : ''}
  `,
  { phase: 'コミット・PR作成', label: `issue #${issue.number} PR作成` }
)

const result = `${plan.issueId} 対応完了（PR: ${pr}）`
log(result)

return { result }

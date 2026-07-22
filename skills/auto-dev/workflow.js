export const meta = {
  name: 'auto-dev',
  description: '新規 issue・PR コメントを検知し、issue の各フェーズを可視化しながら自律的に対応する',
  phases: [
    { title: '検知' },
    { title: '計画立案' },
    { title: 'ブランチ作成' },
    { title: '実装' },
    { title: 'レビュー・E2E検証' },
    { title: 'コミット・PR作成' },
    { title: 'PR対応' },
  ],
}

function dedent(strings, ...values) {
  const bodyLines = strings.flatMap(s => s.split('\n').slice(1)).filter(l => l.trim())
  const indent = bodyLines.length ? Math.min(...bodyLines.map(l => l.match(/^ */)[0].length)) : 0
  const strip = s => s.split('\n').map((l, i) => i === 0 ? l : (l.startsWith(' '.repeat(indent)) ? l.slice(indent) : l)).join('\n')
  return strings.reduce((acc, s, i) => acc + strip(s) + (i < values.length ? values[i] : ''), '').trim()
}

const DETECTED_SCHEMA = {
  type: 'object',
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          number: { type: 'integer' },
          url: { type: 'string' },
        },
        required: ['number', 'url'],
      },
    },
    prs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          number: { type: 'integer' },
          url: { type: 'string' },
          branch: { type: 'string', description: 'PR の head ブランチ名（headRefName）' },
        },
        required: ['number', 'url', 'branch'],
      },
    },
  },
  required: ['issues', 'prs'],
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

const SCREENSHOT_NOTE = 'スクリーンショットは gh gist create などで公開 URL を取得し（gh api で raw_url を取得する等）、Markdown 画像として本文に埋め込んでください。'

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

// ─── Phase: 検知 ────────────────────────────────────────────
phase('検知')

const detected = await agent(
  dedent`
    .claude/local/project.ts の TARGET_REPO・ASSIGNEE を確認し、.claude/local/monitor-state.json
    （無ければ { "seenIssues": [], "lastCommentCheck": null } として新規作成）を読み込んでください。
    そのうえで gh CLI を使い、以下を検知してください。

    - 新規 issue: ASSIGNEE にアサインされた open issue のうち、seenIssues に含まれないもの
    - 新規 PR コメント: ASSIGNEE が作成した open PR のうち、lastCommentCheck 以降に他者から付いたレビューコメントがあるもの
      （各 PR について headRefName も取得し、branch として含める）

    検知が終わったら、見つかった issue 番号を seenIssues に追加し、lastCommentCheck を現在時刻に更新して
    monitor-state.json に書き戻してから、検知結果を返してください。
  `,
  { schema: DETECTED_SCHEMA }
)

log(`issue ${detected.issues.length}件・PRコメント ${detected.prs.length}件を検知`)

// ─── issue 対応（pipeline: 計画立案 → ブランチ作成 → 実装 → レビュー・E2E検証） ─────
const issueResults = await pipeline(
  detected.issues,

  // ─── Phase: 計画立案 ────────────────────────────────────────
  issue => agent(
    dedent`
      引数: "${issue.url}"

      完了したら issueId と planContent を返してください。
    `,
    { agentType: 'plan-issue', schema: PLAN_SCHEMA, phase: '計画立案', label: `issue #${issue.number}` }
  ),

  // ─── Phase: ブランチ作成 ────────────────────────────────────
  async (plan, issue) => {
    if (plan.aborted) return plan

    const branch = await agent(
      dedent`
        引数（実装計画）:
        ${plan.planContent}

        計画中に分岐元ブランチの明記があればそれを baseBranch に、なければ null にしてください。
      `,
      { agentType: 'create-branch-name', schema: BRANCH_SCHEMA, phase: 'ブランチ作成', label: `issue #${issue.number}` }
    )
    await agent(
      dedent`
        git fetch origin を実行し、${branch.baseBranch ? `origin/${branch.baseBranch}` : '.claude/local/project.ts の BASE_BRANCH を起点に origin から'}
        git switch -c ${branch.branchName} でブランチを作成してください。
      `,
      { phase: 'ブランチ作成', label: `issue #${issue.number}` }
    )
    return { ...plan, branchName: branch.branchName, baseBranch: branch.baseBranch }
  },

  // ─── Phase: 実装 ────────────────────────────────────────────
  async (plan, issue) => {
    if (plan.aborted) return plan

    await agent(
      dedent`
        引数（実装計画）:
        ${plan.planContent}
      `,
      { agentType: 'implement', phase: '実装', label: `issue #${issue.number}` }
    )
    return plan
  },

  // ─── Phase: レビュー・E2E検証 ────────────────────────────────
  async (plan, issue) => {
    if (plan.aborted) return `issue #${issue.number} 中止: ${plan.reason}`

    let clean = false
    let findings = null
    let lastE2e = null
    while (!clean) {
      if (findings) {
        await agent(
          dedent`
            引数（指摘事項）:
            ${findings}
          `,
          { agentType: 'implement', phase: 'レビュー・E2E検証', label: `issue #${issue.number} 修正` }
        )
      }
      const [review, e2e] = await parallel([
        () => agent(
          dedent`
            引数なしで実行してください。
            指摘があれば clean:false と findings（指摘内容の要約）、指摘なしなら clean:true と findings:null を返してください。
          `,
          { agentType: 'review-diff', schema: CHECK_SCHEMA, phase: 'レビュー・E2E検証', label: `issue #${issue.number} review` }
        ),
        () => agent(
          dedent`
            引数: "${plan.issueId} の実装内容が正しく動作するか、以下の計画をもとに検証してください。
            検証中の要所でスクリーンショットを撮影し、ファイルパスの一覧を screenshots に含めてください。

            計画:
            ${plan.planContent}"

            問題があれば clean:false と findings（指摘内容の要約）、問題なしなら clean:true と findings:null を返してください。
          `,
          { agentType: 'webapp-testing', schema: E2E_SCHEMA, phase: 'レビュー・E2E検証', label: `issue #${issue.number} e2e` }
        ),
      ])
      lastE2e = e2e
      clean = review.clean && e2e.clean
      findings = [review.findings, e2e.findings].filter(Boolean).join('\n\n') || null
    }
    return { ...plan, screenshots: lastE2e.screenshots }
  },

  // ─── Phase: コミット・PR作成 ──────────────────────────────────
  async (plan, issue) => {
    if (plan.aborted) return `issue #${issue.number} 中止: ${plan.reason}`

    const commit = await agent(
      '現在の差分からコミットメッセージを生成してください。',
      { agentType: 'create-commit-msg', schema: COMMIT_SCHEMA, phase: 'コミット・PR作成', label: `issue #${issue.number} commit` }
    )
    await agent(
      dedent`
        git add -A を実行し、以下の内容で git commit してください。
        メッセージに改行・引用符が含まれる可能性があるため、安全な方法（コミットメッセージをファイルに書き出して git commit -F 等）で実行してください。

        メッセージ: ${commit.message}
        ${commit.body ? `本文:\n${commit.body}` : ''}
      `,
      { phase: 'コミット・PR作成', label: `issue #${issue.number} commit` }
    )
    await agent(
      `git push -u origin ${plan.branchName} を実行してください。`,
      { phase: 'コミット・PR作成', label: `issue #${issue.number} push` }
    )

    const prDraft = await agent(
      dedent`
        引数（実装計画）:
        ${plan.planContent}
      `,
      { agentType: 'draft-pr-description', schema: PR_DRAFT_SCHEMA, phase: 'コミット・PR作成', label: `issue #${issue.number} PR文面` }
    )
    const pr = await agent(
      dedent`
        以下の内容で gh pr create を実行し、作成した PR の URL を返してください。
        body に改行・引用符が含まれる可能性があるため、一時ファイルに書き出して --body-file で渡す等、安全な方法で実行してください。
        ${plan.screenshots?.length ? SCREENSHOT_NOTE : ''}

        base: ${plan.baseBranch || '.claude/local/project.ts の BASE_BRANCH'}
        head: ${plan.branchName}
        title: ${prDraft.title}

        body:
        ${prDraft.description}
        ${plan.screenshots?.length ? `\nスクリーンショット（動作確認時に撮影したもの）:\n${plan.screenshots.join('\n')}` : ''}
      `,
      { phase: 'コミット・PR作成', label: `issue #${issue.number} PR作成` }
    )

    return `${plan.issueId} 対応完了（PR: ${pr}）`
  }
)

// ─── PR対応（pipeline: ブランチ切り替え → 指摘対応 → コミット・push・返信） ─────
const prResults = await pipeline(
  detected.prs,

  // ─── Phase: ブランチ切り替え ──────────────────────────────────
  async (_, pr) => {
    await agent(
      `git fetch origin を実行し、git switch ${pr.branch} でブランチを切り替えてください。`,
      { phase: 'PR対応', label: `pr #${pr.number} 切り替え` }
    )
    return pr
  },

  // ─── Phase: 指摘対応 ────────────────────────────────────────
  pr => agent(
    dedent`
      引数: "${pr.url}"

      完了したら対応内容の要約を返してください。
    `,
    { agentType: 'resolving-pr-comments', phase: 'PR対応', label: `pr #${pr.number}` }
  ),

  // ─── Phase: 動作確認 ────────────────────────────────────────
  async (summary, pr) => {
    const e2e = await agent(
      dedent`
        引数: "以下の対応内容が正しく動作するか検証してください。検証中の要所でスクリーンショットを撮影し、ファイルパスの一覧を screenshots に含めてください。

        対応内容:
        ${summary}"
      `,
      { agentType: 'webapp-testing', schema: E2E_SCHEMA, phase: 'PR対応', label: `pr #${pr.number} 動作確認` }
    )
    return { summary, screenshots: e2e.screenshots }
  },

  // ─── Phase: コミット・push・返信 ────────────────────────────
  async ({ summary, screenshots }, pr) => {
    const commit = await agent(
      '現在の差分からコミットメッセージを生成してください。',
      { agentType: 'create-commit-msg', schema: COMMIT_SCHEMA, phase: 'PR対応', label: `pr #${pr.number} commit` }
    )
    await agent(
      dedent`
        git add -A を実行し、以下の内容で git commit してください。
        メッセージに改行・引用符が含まれる可能性があるため、安全な方法（コミットメッセージをファイルに書き出して git commit -F 等）で実行してください。

        メッセージ: ${commit.message}
        ${commit.body ? `本文:\n${commit.body}` : ''}
      `,
      { phase: 'PR対応', label: `pr #${pr.number} commit` }
    )
    await agent(
      `git push を実行してください（${pr.branch} が upstream 未追跡なら git push -u origin ${pr.branch}）。`,
      { phase: 'PR対応', label: `pr #${pr.number} push` }
    )
    await agent(
      dedent`
        gh pr comment ${pr.number} で、以下の対応内容をまとめて PR に返信してください。
        本文に改行・引用符が含まれる可能性があるため、一時ファイルに書き出して --body-file で渡す等、安全な方法で実行してください。
        ${screenshots.length ? SCREENSHOT_NOTE : ''}

        対応内容:
        ${summary}
        ${screenshots.length ? `\nスクリーンショット（動作確認時に撮影したもの）:\n${screenshots.join('\n')}` : ''}
      `,
      { phase: 'PR対応', label: `pr #${pr.number} 返信` }
    )

    return `pr #${pr.number} 対応完了`
  }
)

const results = {
  issues: issueResults.filter(Boolean),
  prs: prResults.filter(Boolean),
}

log(`issue ${results.issues.length}件・PR ${results.prs.length}件 対応完了`)

return results

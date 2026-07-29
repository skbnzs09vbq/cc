export const meta = {
  name: 'auto-dev-pr-review',
  description: '自分の open PR を1件レビューし、指摘があれば追加、なければマージする',
  phases: [
    { title: '状態確認' },
    { title: 'コードレビュー' },
    { title: 'マージ' },
  ],
}

function dedent(strings, ...values) {
  const bodyLines = strings.flatMap(s => s.split('\n').slice(1)).filter(l => l.trim())
  const indent = bodyLines.length ? Math.min(...bodyLines.map(l => l.match(/^ */)[0].length)) : 0
  const strip = s => s.split('\n').map((l, i) => i === 0 ? l : (l.startsWith(' '.repeat(indent)) ? l.slice(indent) : l)).join('\n')
  return strings.reduce((acc, s, i) => acc + strip(s) + (i < values.length ? values[i] : ''), '').trim()
}

const MERGE_STATE_SCHEMA = {
  type: 'object',
  properties: {
    state: { type: 'string', description: 'PR の state（OPEN/MERGED/CLOSED）' },
    mergeable: { type: 'string', description: 'MERGEABLE/CONFLICTING/UNKNOWN のいずれか' },
  },
  required: ['state', 'mergeable'],
}

const REVIEW_STATUS_SCHEMA = {
  type: 'object',
  properties: {
    hasComments: { type: 'boolean', description: 'レビューコメント・スレッドが1件でもあるか' },
    allResolved: { type: 'boolean', description: 'hasComments が true の場合、すべて resolved になっているか（false の場合は true）' },
  },
  required: ['hasComments', 'allResolved'],
}

const CHECK_SCHEMA = {
  type: 'object',
  properties: {
    clean: { type: 'boolean' },
    findings: { type: ['string', 'null'] },
  },
  required: ['clean', 'findings'],
}

const { pr, worktreePath } = typeof args === 'string' ? JSON.parse(args) : args
const WORKDIR_NOTE = `作業ディレクトリ: ${worktreePath}（git 操作はすべてこのディレクトリ内で行ってください）`

async function mergeAndVerify(pr) {
  await agent(
    dedent`
      gh pr merge ${pr.number}（squash 等、リポジトリの慣習に従ったマージ方法）でマージを試みてください
      失敗しても構わないので、実行結果（成功/失敗とエラーメッセージ）を把握してください
    `,
    { phase: 'マージ', label: `pr #${pr.number} マージ試行` }
  )

  let check = await agent(
    `gh pr view ${pr.number} --json state,mergeable を実行し、結果をそのまま返してください`,
    { phase: 'マージ', label: `pr #${pr.number} マージ確認`, schema: MERGE_STATE_SCHEMA }
  )

  if (check.state === 'MERGED') {
    await agent(`git worktree remove ${worktreePath} --force を実行してください`, { phase: 'マージ', label: `pr #${pr.number} worktree削除` })
    return { merged: true, note: null }
  }

  if (check.mergeable === 'CONFLICTING') {
    await agent(
      dedent`
        ${WORKDIR_NOTE}

        PR #${pr.number}（ブランチ ${pr.branch}）は base ブランチ（main）とコンフリクトしているためマージできません
        git fetch origin を実行し、git merge origin/main を実行してコンフリクトを解消し、git push してください
        コンフリクトの自動解消が困難な場合は、その旨と理由を返してください（無理に解消しないこと）
      `,
      { phase: 'マージ', label: `pr #${pr.number} コンフリクト解消` }
    )

    await agent(
      `gh pr merge ${pr.number}（squash 等、リポジトリの慣習に従ったマージ方法）で再度マージを試みてください`,
      { phase: 'マージ', label: `pr #${pr.number} マージ再試行` }
    )

    check = await agent(
      `gh pr view ${pr.number} --json state,mergeable を実行し、結果をそのまま返してください`,
      { phase: 'マージ', label: `pr #${pr.number} マージ再確認`, schema: MERGE_STATE_SCHEMA }
    )

    if (check.state === 'MERGED') {
      await agent(`git worktree remove ${worktreePath} --force を実行してください`, { phase: 'マージ', label: `pr #${pr.number} worktree削除` })
      return { merged: true, note: null }
    }

    const note = `コンフリクト解消を試みたがマージ未完了（mergeable: ${check.mergeable}）`
    await agent(
      dedent`
        PR #${pr.number}（ブランチ ${pr.branch}）は base ブランチとのコンフリクトを解消できず、マージできませんでした
        以下の内容を gh pr comment で投稿してください

        ${note}
      `,
      { phase: 'マージ', label: `pr #${pr.number} コンフリクト報告` }
    )
    return { merged: false, note }
  }

  return { merged: false, note: `マージ未完了（state: ${check.state}, mergeable: ${check.mergeable}）` }
}

log(`PR #${pr.number} のレビュー・対応を開始`)

// ─── Phase 1: 状態確認 ───────────────────────────────────────
phase('状態確認')

const reviewStatus = await agent(
  dedent`
    PR #${pr.number} のレビューコメント・スレッドの状況を確認してください
    （gh api graphql で reviewThreads の isResolved を確認するなどして判定してください）
    コメントが1件も無ければ hasComments:false、allResolved:true を返してください
  `,
  { schema: REVIEW_STATUS_SCHEMA, label: `pr #${pr.number} 状態確認` }
)

let resolved = !reviewStatus.hasComments || reviewStatus.allResolved

if (!resolved) {
  const fixReview = await agent(
    dedent`
      ${WORKDIR_NOTE}

      PR #${pr.number}（${pr.url}）には未解決のレビュー指摘があります
      最新のコミットがそれぞれの指摘に対応できているか確認してください

      以下の確認をしてください:
      - コミット内容は指摘に対応しているか
      - 修正は完全か（ファイル操作、ロジック、テスト等）
      - 修正後に新しい問題がないか

      対応が確認できたスレッドがあれば、gh api graphql の resolveReviewThread mutation で resolved にしてください
      すべての指摘が解消できたなら 'OK'、まだ未対応・不十分な指摘が残っていれば理由を記載してください
    `,
    { phase: '状態確認', label: `pr #${pr.number} 修正確認` }
  )
  resolved = fixReview.toLowerCase().includes('ok')
}

let result

if (!resolved) {
  result = `pr #${pr.number}: 未解決の指摘あり`
} else if (!reviewStatus.hasComments) {
  // ─── Phase 2: コードレビュー ────────────────────────────────
  phase('コードレビュー')

  const codeReview = await agent(
    dedent`
      ${WORKDIR_NOTE}

      引数なしで実行してください
    `,
    { agentType: 'review-diff', schema: CHECK_SCHEMA, phase: 'コードレビュー', label: `pr #${pr.number} code-review` }
  )

  if (codeReview.clean) {
    // ─── Phase 3: マージ ──────────────────────────────────────
    phase('マージ')
    const { merged, note } = await mergeAndVerify(pr)
    result = merged ? `pr #${pr.number}: 指摘なし、マージ完了` : `pr #${pr.number}: 指摘なしだが未マージ（${note}）`
  } else {
    await agent(
      dedent`
        PR #${pr.number} の code-review で指摘が見つかりました
        以下の内容を gh pr comment で投稿してください

        ${codeReview.findings}
      `,
      { phase: 'コードレビュー', label: `pr #${pr.number} code-review指摘` }
    )
    result = `pr #${pr.number}: code-review で指摘あり`
  }
} else {
  // ─── Phase 3: マージ ──────────────────────────────────────
  phase('マージ')
  const { merged, note } = await mergeAndVerify(pr)
  result = merged ? `pr #${pr.number}: 指摘すべて解消済み、マージ完了` : `pr #${pr.number}: 指摘は解消済みだが未マージ（${note}）`
}

log(result)

return { result }

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

const MERGE_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    merged: { type: 'boolean' },
    conflict: { type: 'boolean' },
    message: { type: 'string' },
  },
  required: ['merged', 'conflict', 'message'],
}

const RESOLVE_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    resolved: { type: 'boolean' },
    message: { type: 'string' },
  },
  required: ['resolved', 'message'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    allAddressed: { type: 'boolean' },
    message: { type: 'string' },
  },
  required: ['allAddressed', 'message'],
}

const REVIEW_STATUS_SCHEMA = {
  type: 'object',
  properties: {
    hasComments: { type: 'boolean', description: 'レビューコメント・スレッドが1件でもあるか' },
    allResolved: { type: 'boolean', description: 'hasComments が true の場合、すべて resolved になっているか（false の場合は true）' },
  },
  required: ['hasComments', 'allResolved'],
}

const FINDING_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    path: { type: 'string', description: 'リポジトリルートからの相対パス' },
    line: { type: 'integer', description: '指摘対象の行番号（diffの新しい側の行番号）' },
    title: { type: 'string' },
    body: { type: 'string', description: '問題点と修正案' },
  },
  required: ['path', 'line', 'title', 'body'],
}

const CHECK_SCHEMA = {
  type: 'object',
  properties: {
    clean: { type: 'boolean' },
    findings: {
      type: ['string', 'null'],
      description: 'clean が false の場合、出力フォーマットに従って整形した指摘内容。true の場合は null',
    },
  },
  required: ['clean', 'findings'],
}

const STRUCTURED_FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: FINDING_ITEM_SCHEMA,
      description: 'ファイル・行ごとに分割した指摘一覧（無ければ空配列）',
    },
  },
  required: ['findings'],
}

const { pr, worktreePath } = typeof args === 'string' ? JSON.parse(args) : args

async function mergeAndVerify(pr) {
  const result = await agent(
    JSON.stringify({ workingDir: worktreePath, prNumber: pr.number }),
    { agentType: 'git-pr-merge', schema: MERGE_RESULT_SCHEMA, phase: 'マージ', label: `pr #${pr.number} マージ試行` }
  )

  if (result.merged) {
    await agent(
      JSON.stringify({ issueNumber: pr.issueNumber, forceConfirmed: true }),
      { agentType: 'git-worktree-remove', phase: 'マージ', label: `pr #${pr.number} worktree削除` }
    )
    return { merged: true, note: null }
  }

  if (result.conflict) {
    const resolveResult = await agent(
      JSON.stringify({ workingDir: worktreePath, baseBranch: null, force: true, visualCheckUrl: null, serverCommand: null, port: null }),
      { agentType: 'git-conflict-resolve', schema: RESOLVE_RESULT_SCHEMA, phase: 'マージ', label: `pr #${pr.number} コンフリクト解消` }
    )

    if (!resolveResult.resolved) {
      const note = resolveResult.message
      await agent(
        JSON.stringify({ workingDir: worktreePath, prNumber: pr.number, body: note, screenshots: null }),
        { agentType: 'git-pr-comment', phase: 'マージ', label: `pr #${pr.number} コンフリクト報告` }
      )
      return { merged: false, note }
    }

    const retryResult = await agent(
      JSON.stringify({ workingDir: worktreePath, prNumber: pr.number }),
      { agentType: 'git-pr-merge', schema: MERGE_RESULT_SCHEMA, phase: 'マージ', label: `pr #${pr.number} マージ再試行` }
    )

    if (retryResult.merged) {
      await agent(
        JSON.stringify({ issueNumber: pr.issueNumber, forceConfirmed: true }),
        { agentType: 'git-worktree-remove', phase: 'マージ', label: `pr #${pr.number} worktree削除` }
      )
      return { merged: true, note: null }
    }

    const note = `コンフリクト解消を試みたがマージ未完了（${retryResult.message}）`
    await agent(
      JSON.stringify({ workingDir: worktreePath, prNumber: pr.number, body: note, screenshots: null }),
      { agentType: 'git-pr-comment', phase: 'マージ', label: `pr #${pr.number} コンフリクト報告` }
    )
    return { merged: false, note }
  }

  return { merged: false, note: result.message }
}

log(`PR #${pr.number} のレビュー・対応を開始`)

// ─── Phase 1: 状態確認 ───────────────────────────────────────
phase('状態確認')

const reviewStatus = await agent(
  JSON.stringify({ prNumber: pr.number }),
  { agentType: 'git-pr-review-status', schema: REVIEW_STATUS_SCHEMA, phase: '状態確認', label: `pr #${pr.number} 状態確認` }
)

let resolved = !reviewStatus.hasComments || reviewStatus.allResolved

if (!resolved) {
  const fixReview = await agent(
    JSON.stringify({ workingDir: worktreePath, prNumber: pr.number }),
    { agentType: 'git-pr-review-verify', schema: VERIFY_SCHEMA, phase: '状態確認', label: `pr #${pr.number} 修正確認` }
  )
  resolved = fixReview.allAddressed
}

let result

if (!resolved) {
  result = `pr #${pr.number}: 未解決の指摘あり`
} else if (!reviewStatus.hasComments) {
  // ─── Phase 2: コードレビュー ────────────────────────────────
  phase('コードレビュー')

  const codeReview = await agent(
    JSON.stringify({ workingDir: worktreePath, mode: 'check' }),
    { agentType: 'review-diff', schema: CHECK_SCHEMA, phase: 'コードレビュー', label: `pr #${pr.number} code-review` }
  )

  if (codeReview.clean) {
    // ─── Phase 3: マージ ──────────────────────────────────────
    phase('マージ')
    const { merged, note } = await mergeAndVerify(pr)
    result = merged ? `pr #${pr.number}: 指摘なし、マージ完了` : `pr #${pr.number}: 指摘なしだが未マージ（${note}）`
  } else {
    const structured = await agent(
      dedent`
        以下のレビュー指摘を、ファイル・行ごとに分割した配列に整形してください。

        ${codeReview.findings}
      `,
      { schema: STRUCTURED_FINDINGS_SCHEMA, phase: 'コードレビュー', label: `pr #${pr.number} 指摘の構造化` }
    )

    const existingComments = await agent(
      JSON.stringify({ prNumber: pr.number }),
      { agentType: 'git-pr-comments-list', phase: 'コードレビュー', label: `pr #${pr.number} 既存コメント取得` }
    )

    const newFindings = await agent(
      JSON.stringify({ items: structured.findings, existing: existingComments, similarityLevel: null }),
      { agentType: 'dedup-items', phase: 'コードレビュー', label: `pr #${pr.number} 新規指摘の抽出` }
    )

    if (newFindings.length === 0) {
      result = `pr #${pr.number}: code-review で指摘あり（すべて投稿済みのため新規コメントなし）`
    } else {
      await agent(
        JSON.stringify({ workingDir: worktreePath, prNumber: pr.number, findings: newFindings }),
        { agentType: 'git-pr-review-post', phase: 'コードレビュー', label: `pr #${pr.number} インラインコメント投稿` }
      )
      result = `pr #${pr.number}: code-review で新規指摘 ${newFindings.length}件を投稿`
    }
  }
} else {
  // ─── Phase 3: マージ ──────────────────────────────────────
  phase('マージ')
  const { merged, note } = await mergeAndVerify(pr)
  result = merged ? `pr #${pr.number}: 指摘すべて解消済み、マージ完了` : `pr #${pr.number}: 指摘は解消済みだが未マージ（${note}）`
}

log(result)

return { result }

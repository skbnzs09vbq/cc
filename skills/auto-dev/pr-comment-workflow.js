export const meta = {
  name: 'auto-dev-pr-comment',
  description: '指摘・コメントのある PR に対応する',
  phases: [
    { title: 'PR対応' },
  ],
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

const { pr, worktreePath } = typeof args === 'string' ? JSON.parse(args) : args

log(`PR #${pr.number} のコメント対応を開始`)

// ─── Phase 1: PR対応 ─────────────────────────────────────────
phase('PR対応')

const summary = await agent(
  JSON.stringify({ workingDir: worktreePath, url: pr.url, autonomous: true }),
  { agentType: 'git-pr-resolve-comments', phase: 'PR対応', label: `pr #${pr.number}` }
)

const e2e = await agent(
  JSON.stringify({
    workingDir: worktreePath,
    description: `以下の対応内容が正しく動作するか検証する:\n${summary}`,
    serverCommand: null,
    port: null,
  }),
  { agentType: 'test-e2e', schema: E2E_SCHEMA, phase: 'PR対応', label: `pr #${pr.number} 動作確認` }
)

await agent(
  JSON.stringify({ workingDir: worktreePath, message: null, body: null }),
  { agentType: 'git-commit', phase: 'PR対応', label: `pr #${pr.number} commit` }
)
await agent(
  JSON.stringify({ workingDir: worktreePath, branch: pr.branch }),
  { agentType: 'git-push', phase: 'PR対応', label: `pr #${pr.number} push` }
)
await agent(
  JSON.stringify({
    workingDir: worktreePath,
    prNumber: pr.number,
    body: summary,
    screenshots: e2e.screenshots.length ? e2e.screenshots : null,
  }),
  { agentType: 'git-pr-comment', phase: 'PR対応', label: `pr #${pr.number} 返信` }
)

const result = `pr #${pr.number} 対応完了`
log(result)

return { result }

export const meta = {
  name: 'auto-dev-pr-comment',
  description: '指摘・コメントのある PR に対応する',
  phases: [
    { title: 'PR対応' },
  ],
}

function dedent(strings, ...values) {
  const bodyLines = strings.flatMap(s => s.split('\n').slice(1)).filter(l => l.trim())
  const indent = bodyLines.length ? Math.min(...bodyLines.map(l => l.match(/^ */)[0].length)) : 0
  const strip = s => s.split('\n').map((l, i) => i === 0 ? l : (l.startsWith(' '.repeat(indent)) ? l.slice(indent) : l)).join('\n')
  return strings.reduce((acc, s, i) => acc + strip(s) + (i < values.length ? values[i] : ''), '').trim()
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
const WORKDIR_NOTE = `作業ディレクトリ: ${worktreePath}（git 操作はすべてこのディレクトリ内で行ってください）`

log(`PR #${pr.number} のコメント対応を開始`)

// ─── Phase 1: PR対応 ─────────────────────────────────────────
phase('PR対応')

const summary = await agent(
  dedent`
    ${WORKDIR_NOTE}

    ${JSON.stringify({ url: pr.url, autonomous: true })}
  `,
  { agentType: 'resolving-pr-comments', phase: 'PR対応', label: `pr #${pr.number}` }
)

const e2e = await agent(
  dedent`
    ${WORKDIR_NOTE}

    以下の対応内容が正しく動作するか検証してください
    検証中の要所でスクリーンショットを撮影し、ファイルパスの一覧を screenshots に含めてください

    対応内容:
    ${summary}
  `,
  { agentType: 'webapp-testing', schema: E2E_SCHEMA, phase: 'PR対応', label: `pr #${pr.number} 動作確認` }
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
  { agentType: 'comment-pr', phase: 'PR対応', label: `pr #${pr.number} 返信` }
)

const result = `pr #${pr.number} 対応完了`
log(result)

return { result }

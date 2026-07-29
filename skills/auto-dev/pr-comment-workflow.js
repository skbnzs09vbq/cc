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

const SCREENSHOT_NOTE = 'スクリーンショットは gh gist create などで公開 URL を取得し（gh api で raw_url を取得する等）、Markdown 画像として本文に埋め込んでください'

const COMMIT_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    body: { type: ['string', 'null'] },
  },
  required: ['message', 'body'],
}

const { pr, worktreePath } = args
const WORKDIR_NOTE = `作業ディレクトリ: ${worktreePath}（git 操作はすべてこのディレクトリ内で行ってください）`

log(`PR #${pr.number} のコメント対応を開始`)

// ─── Phase: PR対応 ────────────────────────────────────────
phase('PR対応')

const summary = await agent(
  dedent`
    ${WORKDIR_NOTE}

    url: ${pr.url}
    autonomous: true

    完了したら対応内容の要約を返してください
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

const commit = await agent(
  dedent`
    ${WORKDIR_NOTE}

    現在の差分からコミットメッセージを生成してください
  `,
  { agentType: 'create-commit-msg', schema: COMMIT_SCHEMA, phase: 'PR対応', label: `pr #${pr.number} commit` }
)
await agent(
  dedent`
    ${WORKDIR_NOTE}

    git add -A を実行し、以下の内容で git commit してください
    メッセージに改行・引用符が含まれる可能性があるため（コミットメッセージをファイルに書き出して git commit -F 等）

    メッセージ: ${commit.message}
    ${commit.body ? `本文:\n${commit.body}` : ''}
  `,
  { phase: 'PR対応', label: `pr #${pr.number} commit` }
)
await agent(
  dedent`
    ${WORKDIR_NOTE}

    git push を実行してください（${pr.branch} が upstream 未追跡なら git push -u origin ${pr.branch}）
  `,
  { phase: 'PR対応', label: `pr #${pr.number} push` }
)
await agent(
  dedent`
    gh pr comment ${pr.number} で、以下の対応内容をまとめて PR に返信してください
    本文に改行・引用符が含まれる可能性があるため、一時ファイルに書き出して --body-file で渡す等で実行してください
    ${e2e.screenshots.length ? SCREENSHOT_NOTE : ''}

    対応内容:
    ${summary}
    ${e2e.screenshots.length ? `\nスクリーンショット（動作確認時に撮影したもの）:\n${e2e.screenshots.join('\n')}` : ''}
  `,
  { phase: 'PR対応', label: `pr #${pr.number} 返信` }
)

const result = `pr #${pr.number} 対応完了`
log(result)

return { result }

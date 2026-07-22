export const meta = {
  name: 'auto-dev-pr-review',
  description: '自分の open PR を /review コマンドでレビューし、指摘があれば追加、なければマージする',
  phases: [
    { title: 'PR一覧取得' },
    { title: 'レビュー・対応' },
  ],
}

function dedent(strings, ...values) {
  const bodyLines = strings.flatMap(s => s.split('\n').slice(1)).filter(l => l.trim())
  const indent = bodyLines.length ? Math.min(...bodyLines.map(l => l.match(/^ */)[0].length)) : 0
  const strip = s => s.split('\n').map((l, i) => i === 0 ? l : (l.startsWith(' '.repeat(indent)) ? l.slice(indent) : l)).join('\n')
  return strings.reduce((acc, s, i) => acc + strip(s) + (i < values.length ? values[i] : ''), '').trim()
}

const PR_LIST_SCHEMA = {
  type: 'object',
  properties: {
    prs: {
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
  },
  required: ['prs'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: { type: 'string' },
      description: '指摘事項の一覧（ファイル・行・問題点・修正案を含む1件ずつのテキスト）。なければ空配列',
    },
  },
  required: ['findings'],
}

// ─── Phase: PR一覧取得 ────────────────────────────────────────
phase('PR一覧取得')

const { prs } = await agent(
  dedent`
    .claude/local/project.ts の TARGET_REPO・ASSIGNEE を確認し、
    gh pr list --repo <TARGET_REPO> --author <ASSIGNEE> --state open --json number,url で
    自分が作成した open PR の一覧を取得して返してください。
  `,
  { schema: PR_LIST_SCHEMA }
)

log(`open PR ${prs.length}件を検知`)

// ─── PR対応（pipeline: レビュー → 指摘投稿 or マージ） ─────
const results = await pipeline(
  prs,

  // ─── Phase: レビュー ────────────────────────────────────────
  pr => agent(
    dedent`
      Claude Code の /review コマンドの手順に従い、PR #${pr.number}（${pr.url}）をレビューしてください。
      指摘事項があれば findings に1件ずつ（ファイル・行・問題点・修正案が分かる形で）列挙し、なければ空配列を返してください。
    `,
    { schema: REVIEW_SCHEMA, phase: 'レビュー・対応', label: `pr #${pr.number} review` }
  ),

  // ─── Phase: 指摘投稿 or マージ ─────────────────────────────
  async (review, pr) => {
    if (review.findings.length > 0) {
      await agent(
        dedent`
          以下の指摘事項を、レビューコメントとして PR #${pr.number} に投稿してください（gh pr review --comment 等）。
          本文に改行・引用符が含まれる可能性があるため、一時ファイルに書き出す等、安全な方法で実行してください。

          指摘事項:
          ${review.findings.map((f, i) => `${i + 1}. ${f}`).join('\n\n')}
        `,
        { phase: 'レビュー・対応', label: `pr #${pr.number} 指摘投稿` }
      )
      return `pr #${pr.number}: 指摘 ${review.findings.length}件を投稿`
    }

    await agent(
      `PR #${pr.number} には指摘事項がありませんでした。gh pr merge ${pr.number}（squash 等、リポジトリの慣習に従ったマージ方法）でマージしてください。`,
      { phase: 'レビュー・対応', label: `pr #${pr.number} マージ` }
    )
    return `pr #${pr.number}: 指摘なし、マージ完了`
  }
)

log(`${results.filter(Boolean).length}件の PR を処理`)

return { results: results.filter(Boolean) }

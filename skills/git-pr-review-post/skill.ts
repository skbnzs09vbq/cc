import { getArgs } from '../_shared/args.js'
import { type Schema, respond, runCommand, writeFile } from '../_shared/complete.js'
import { REPO } from '../_shared/git.js'
import type { Infer } from '../_shared/infer.js'

const FINDING_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    path: { type: 'string', description: 'リポジトリルートからの相対パス' },
    line: { type: 'integer', description: '指摘対象の行番号（diffの新しい側の行番号）' },
    title: { type: 'string' },
    body: { type: 'string', description: '問題点と修正案' },
  },
  required: ['path', 'line', 'title', 'body'],
} as const satisfies Schema

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    workingDir: {
      type: 'string',
      description: 'ペイロードの一時ファイルを書き出すディレクトリ（worktree 内）',
    },
    prNumber: { type: 'integer', description: '対象 PR 番号' },
    findings: {
      type: 'array',
      items: FINDING_ITEM_SCHEMA,
      description: 'インラインコメントとしてまとめて投稿する指摘一覧',
    },
  },
  required: ['workingDir', 'prNumber', 'findings'],
} as const satisfies Schema

export function gitPrReviewPost(args: Infer<typeof ARGS_SCHEMA>): string | null {
  const { workingDir, prNumber, findings } = args

  const sha = runCommand([`gh pr view ${prNumber} --json headRefOid --jq .headRefOid`])

  const payload = {
    commit_id: sha,
    event: 'COMMENT',
    comments: findings.map((f) => ({
      path: f.path,
      line: f.line,
      body: `**${f.title}**\n\n${f.body}`,
    })),
  }

  const payloadPath = `${workingDir}/.pr_review_payload.json`
  writeFile(payloadPath, JSON.stringify(payload, null, 2))

  return runCommand([
    `gh api repos/${REPO}/pulls/${prNumber}/reviews --method POST --input ${payloadPath} && rm -f ${payloadPath}`,
  ])
}

respond(gitPrReviewPost(getArgs(ARGS_SCHEMA)))

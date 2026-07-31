import { getArgs } from '../_shared/args.js'
import { type Schema, respond, runCommand, writeFile } from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'
import { dedent } from '../_shared/utils.js'

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    workingDir: {
      type: 'string',
      description: 'gh pr comment を実行するディレクトリ（worktree 内）',
    },
    prNumber: { type: 'integer', description: '対象 PR 番号' },
    body: { type: 'string', description: 'コメント本文' },
    screenshots: {
      type: ['array', 'null'],
      items: { type: 'string' },
      description: '添付するスクリーンショットのローカルファイルパス一覧（無ければ null）',
    },
  },
  required: ['workingDir', 'prNumber', 'body', 'screenshots'],
} as const satisfies Schema

export function gitPrComment(args: Infer<typeof ARGS_SCHEMA>): string | null {
  const { workingDir, prNumber, body, screenshots } = args

  const screenshotsSection = screenshots?.length
    ? dedent`
        ## スクリーンショット
        ${screenshots
          .map((path) => {
            const url = runCommand([
              `gh gist create ${path} --filename '${path.split('/').pop()}' -q`,
            ])
            const rawUrl = runCommand([
              `gh api gists/${url?.split('/').pop()} -q '.files[].raw_url'`,
            ])
            return `![${path.split('/').pop()}](${rawUrl})`
          })
          .join('\n')}
      `
    : null

  const commentPath = `${workingDir}/.pr_comment.md`
  writeFile(commentPath, [body, screenshotsSection].filter(Boolean).join('\n\n'))

  return runCommand([
    `cd ${workingDir} && gh pr comment ${prNumber} --body-file ${commentPath} && rm -f ${commentPath}`,
  ])
}

respond(gitPrComment(getArgs(ARGS_SCHEMA)))

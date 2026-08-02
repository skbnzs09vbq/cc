import { BASE_BRANCH } from '../../local/project.js'
import { gitPrDraft } from '../git-pr-draft/skill.js'
import { getArgs } from '../_shared/args.js'
import { type Schema, respond, runCommand, writeFile } from '../_shared/complete.js'
import { NAME, OWNER, REPO, gitBuildScreenshotsSection } from '../_shared/git.js'
import type { Infer } from '../_shared/infer.js'

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    workingDir: { type: 'string', description: 'gh pr create を実行するディレクトリ' },
    head: { type: 'string', description: 'PR の head ブランチ名' },
    base: {
      type: ['string', 'null'],
      description: 'string: 分岐元ブランチ名, null: 未指定（BASE_BRANCH を使う）',
    },
    title: {
      type: ['string', 'null'],
      description: 'string: PR タイトル, null: 未定（workDescription から git-pr-draft で決定する）',
    },
    description: {
      type: ['string', 'null'],
      description: 'string: PR 本文の Description 部分, null: title と同様に未定な場合',
    },
    closesIssue: {
      type: ['integer', 'null'],
      description:
        'integer: この PR が close する issue 番号（あれば本文冒頭に "Closes #N" を付ける）, null: 無い場合',
    },
    workDescription: {
      type: ['string', 'null'],
      description:
        'string: title/description が null の場合に git-pr-draft に渡す実装計画等の説明, null: 不要な場合',
    },
    additionalBody: {
      type: ['string', 'null'],
      description:
        'string: 本文末尾に追記する内容（既知の指摘など、スクリーンショットは screenshots で渡す）, null: 無い場合',
    },
    screenshots: {
      type: ['array', 'null'],
      items: { type: 'string' },
      description:
        'array: 動作確認時に撮影したスクリーンショットのローカルファイルパス一覧, null: 無ければ',
    },
  },
  required: [
    'workingDir',
    'head',
    'base',
    'title',
    'description',
    'closesIssue',
    'workDescription',
    'additionalBody',
    'screenshots',
  ],
} as const satisfies Schema

export function gitPrCreate(args: Infer<typeof ARGS_SCHEMA>): string | null {
  const { workingDir, closesIssue, workDescription, additionalBody, screenshots } = args
  let { title, description } = args

  if (!title || !description) {
    const draft = gitPrDraft(workDescription ?? '')
    title = draft.title
    description = draft.description
  }

  const base = args.base ?? BASE_BRANCH

  const screenshotsSection = gitBuildScreenshotsSection(screenshots, (path) => {
    const normalized = path.replace(/\\/g, '/')
    const workingDirNormalized = workingDir.replace(/\\/g, '/')
    const relPath = normalized.startsWith(workingDirNormalized)
      ? normalized.slice(workingDirNormalized.length).replace(/^\//, '')
      : normalized.split('/').pop()!
    return `https://raw.githubusercontent.com/${OWNER}/${NAME}/${args.head}/${relPath}`
  })

  const bodyContent = [
    closesIssue ? `Closes #${closesIssue}` : null,
    description,
    screenshotsSection,
    additionalBody,
  ]
    .filter(Boolean)
    .join('\n\n')

  const prBodyPath = `${workingDir}/.pr_body.md`
  writeFile(prBodyPath, bodyContent)

  return runCommand([
    `cd ${workingDir} && gh pr create --base ${base} --head ${args.head} --title ${title} --body-file ${prBodyPath} && rm -f ${prBodyPath}`,
  ])
}

respond(gitPrCreate(getArgs(ARGS_SCHEMA)))

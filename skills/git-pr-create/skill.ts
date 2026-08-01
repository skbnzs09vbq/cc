import { BASE_BRANCH, TARGET_REPO } from '../../local/project.js'
import { gitPrDraft } from '../git-pr-draft/skill.js'
import { getArgs } from '../_shared/args.js'
import { type Schema, complete, respond, runCommand, writeFile } from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'
import { dedent } from '../_shared/utils.js'

const REPO = TARGET_REPO.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '')
const [OWNER, NAME] = REPO.split('/')

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    workingDir: { type: 'string', description: 'gh pr create を実行するディレクトリ' },
    head: { type: 'string', description: 'PR の head ブランチ名' },
    base: {
      type: ['string', 'null'],
      description: '分岐元ブランチ名\n未指定なら null（BASE_BRANCH を使う）',
    },
    title: {
      type: ['string', 'null'],
      description: 'PR タイトル\n未定なら null（workDescription から git-pr-draft で決定する）',
    },
    description: {
      type: ['string', 'null'],
      description: 'PR 本文の Description 部分\ntitle と同様に未定なら null',
    },
    closesIssue: {
      type: ['integer', 'null'],
      description: 'この PR が close する issue 番号\nあれば本文冒頭に "Closes #N" を付ける',
    },
    workDescription: {
      type: ['string', 'null'],
      description: 'title/description が null の場合に git-pr-draft に渡す実装計画等の説明',
    },
    additionalBody: {
      type: ['string', 'null'],
      description:
        '本文末尾に追記する内容（既知の指摘など\nスクリーンショットは screenshots で渡す）',
    },
    screenshots: {
      type: ['array', 'null'],
      items: { type: 'string' },
      description:
        '動作確認時に撮影したスクリーンショットのローカルファイルパス一覧（無ければ null）',
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
    const picked = complete(
      dedent`
        以下は PR タイトル・description の下書きです\nこの内容をそのまま採用してください

        ${draft}
      `,
      {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['title', 'description'],
      } as const,
    )
    title = picked.title
    description = picked.description
  }

  const base = args.base ?? BASE_BRANCH

  const screenshotsSection = screenshots?.length
    ? dedent`
        ## スクリーンショット
        ${screenshots
          .map((path) => {
            const normalized = path.replace(/\\/g, '/')
            const workingDirNormalized = workingDir.replace(/\\/g, '/')
            const relPath = normalized.startsWith(workingDirNormalized)
              ? normalized.slice(workingDirNormalized.length).replace(/^\//, '')
              : normalized.split('/').pop()!
            const rawUrl = `https://raw.githubusercontent.com/${OWNER}/${NAME}/${args.head}/${relPath}`
            return `![${normalized.split('/').pop()}](${rawUrl})`
          })
          .join('\n')}
      `
    : null

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

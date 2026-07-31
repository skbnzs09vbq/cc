import { BASE_BRANCH } from '../../local/project.js'
import { getArgs } from '../_shared/args.js'
import { type Schema, complete, respond, runCommand, writeFile } from '../_shared/complete.js'
import { dedent } from '../_shared/utils.js'

const ARGS_SCHEMA: Schema = {
  type: 'object',
  properties: {
    workingDir: { type: 'string', description: 'gh pr create を実行するディレクトリ' },
    head: { type: 'string', description: 'PR の head ブランチ名' },
    base: { type: ['string', 'null'], description: '分岐元ブランチ名。未指定なら null（BASE_BRANCH を使う）' },
    title: {
      type: ['string', 'null'],
      description: 'PR タイトル。未定なら null（workDescription から draft-pr-description で決定する）',
    },
    description: { type: ['string', 'null'], description: 'PR 本文の Description 部分。title と同様に未定なら null' },
    closesIssue: {
      type: ['integer', 'null'],
      description: 'この PR が close する issue 番号。あれば本文冒頭に "Closes #N" を付ける',
    },
    workDescription: {
      type: ['string', 'null'],
      description: 'title/description が null の場合に draft-pr-description に渡す実装計画等の説明',
    },
    additionalBody: {
      type: ['string', 'null'],
      description: '本文末尾に追記する内容（既知の指摘など。スクリーンショットは screenshots で渡す）',
    },
    screenshots: {
      type: ['array', 'null'],
      items: { type: 'string' },
      description: '動作確認時に撮影したスクリーンショットのローカルファイルパス一覧（無ければ null）',
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
}

const {
  workingDir,
  head,
  base: inputBase,
  title: inputTitle,
  description: inputDescription,
  closesIssue,
  workDescription,
  additionalBody,
  screenshots,
} = getArgs<{
  workingDir: string
  head: string
  base: string | null
  title: string | null
  description: string | null
  closesIssue: number | null
  workDescription: string | null
  additionalBody: string | null
  screenshots: string[] | null
}>(ARGS_SCHEMA)

let title = inputTitle
let description = inputDescription
if (!title || !description) {
  const draft = Skill('draft-pr-description', workDescription)
  const picked = complete<{ title: string; description: string }>(
    dedent`
      以下は PR タイトル・description の下書きです。この内容をそのまま採用してください

      ${draft}
    `,
    {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['title', 'description'],
    },
  )
  title = picked.title
  description = picked.description
}

const base = inputBase ?? BASE_BRANCH

const screenshotsSection = screenshots?.length
  ? dedent`
      ## スクリーンショット
      ${screenshots
        .map((path) => {
          const url = runCommand([`gh gist create ${path} --filename '${path.split('/').pop()}' -q`])
          const rawUrl = runCommand([`gh api gists/${url?.split('/').pop()} -q '.files[].raw_url'`])
          return `![${path.split('/').pop()}](${rawUrl})`
        })
        .join('\n')}
    `
  : null

const body = [closesIssue ? `Closes #${closesIssue}` : null, description, screenshotsSection, additionalBody]
  .filter(Boolean)
  .join('\n\n')

const prBodyPath = `${workingDir}/.pr_body.md`
writeFile(prBodyPath, body)

const url = runCommand([
  `cd ${workingDir} && gh pr create --base ${base} --head ${head} --title ${title} --body-file ${prBodyPath} && rm -f ${prBodyPath}`,
])

respond(url)

import { getArgs } from '../_shared/args.js'
import { type Schema, complete, respond, runCommand, writeFile } from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'
import { dedent } from '../_shared/utils.js'
import { gitCommitMessage } from '../git-commit-message/skill.js'

const PICKED_MESSAGE_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    body: { type: ['string', 'null'] },
  },
  required: ['message', 'body'],
} as const satisfies Schema

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    workingDir: { type: 'string', description: 'commit を実行するディレクトリ' },
    message: { type: ['string', 'null'], description: 'コミットメッセージ\n未定なら null' },
    body: { type: ['string', 'null'], description: 'コミット本文（任意）' },
  },
  required: ['workingDir', 'message', 'body'],
} as const satisfies Schema

export function gitCommit(args: Infer<typeof ARGS_SCHEMA>): string {
  const { workingDir } = args
  let { message, body } = args

  if (!message) {
    const candidates = gitCommitMessage(workingDir)
    const picked = complete(
      dedent`
        以下の候補から最も適切な1つを選んでください

        ${candidates}
      `,
      PICKED_MESSAGE_SCHEMA,
    )
    message = picked.message
    body = picked.body
  }

  const commitMsgPath = `${workingDir}/.commit_msg.txt`

  runCommand([`cd ${workingDir} && git add -A`])
  writeFile(commitMsgPath, body ? `${message}\n\n${body}` : message)
  runCommand([`cd ${workingDir} && git commit -F ${commitMsgPath} && rm -f ${commitMsgPath}`])

  return message
}

respond(gitCommit(getArgs(ARGS_SCHEMA)))

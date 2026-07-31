import { getArgs } from '../_shared/args.js'
import { type Schema, complete, respond, runCommand, writeFile } from '../_shared/complete.js'
import { dedent } from '../_shared/utils.js'

const ARGS_SCHEMA: Schema = {
  type: 'object',
  properties: {
    workingDir: { type: 'string', description: 'commit を実行するディレクトリ' },
    message: { type: ['string', 'null'], description: 'コミットメッセージ。未定なら null' },
    body: { type: ['string', 'null'], description: 'コミット本文（任意）' },
  },
  required: ['workingDir', 'message', 'body'],
}

const {
  workingDir,
  message: inputMessage,
  body: inputBody,
} = getArgs<{
  workingDir: string
  message: string | null
  body: string | null
}>(ARGS_SCHEMA)

let message = inputMessage
let body = inputBody
if (!message) {
  const candidates = Skill('create-commit-msg')
  const picked = complete<{ message: string; body: string | null }>(
    dedent`
      以下の候補から最も適切な1つを選んでください

      ${candidates}
    `,
    {
      type: 'object',
      properties: {
        message: { type: 'string' },
        body: { type: ['string', 'null'] },
      },
      required: ['message', 'body'],
    },
  )
  message = picked.message
  body = picked.body
}

const commitMsgPath = `${workingDir}/.commit_msg.txt`

runCommand([`cd ${workingDir} && git add -A`])
writeFile(commitMsgPath, body ? `${message}\n\n${body}` : message)
runCommand([`cd ${workingDir} && git commit -F ${commitMsgPath} && rm -f ${commitMsgPath}`])

respond(message)

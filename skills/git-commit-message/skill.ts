import {
  COMMIT_ALLOW_BODY,
  COMMIT_FORMAT,
  COMMIT_LANG,
  TICKET_PREFIX,
  TYPES,
} from '../../local/project.js'
import { type Schema, complete, remember, respond, runCommand } from '../_shared/complete.js'
import { dedent } from '../_shared/utils.js'

const ANGLES = ['scope', 'action', 'concise', 'descriptive']

const CANDIDATE_SCHEMA = {
  type: 'object',
  properties: {
    message: {
      type: 'string',
      description: `コミットメッセージの形式 "${COMMIT_FORMAT}" のプレースホルダをすべて埋めた1行`,
    },
    body: { type: ['string', 'null'] },
  },
  required: ['message'],
} as const satisfies Schema

export function gitCommitMessage(): string {
  remember(['git commit は実行しないこと'])

  // ─── Phase 1: コンテキスト取得 ─────────────────────────────
  phase('コンテキスト取得')

  const branch = runCommand(['git rev-parse --abbrev-ref HEAD'])

  let diff = runCommand(['git diff --cached'])
  if (!diff || !diff.trim()) diff = runCommand(['git diff HEAD'])

  // ─── Phase 2: 候補生成 ─────────────────────────────────────
  phase('候補生成')

  const candidates = ANGLES.map((angle) =>
    complete(
      dedent`
      以下の差分から、"${angle}" の切り口でコミットメッセージ候補を1つ生成してください

      コミットメッセージの形式: "${COMMIT_FORMAT}"
      {type} を使う場合の選択肢: ${TYPES.join(' / ')}
      TICKET_PREFIX: ${TICKET_PREFIX}
      ブランチ名: ${branch}

      差分:
      ${diff}

      説明文は ${COMMIT_LANG} で簡潔に\nbody は${COMMIT_ALLOW_BODY ? '含めてよい' : '含めない'}
    `,
      CANDIDATE_SCHEMA,
    ),
  )

  // ─── Phase 3: 出力の整形 ─────────────────────────────────
  phase('出力の整形')

  return candidates
    .map((c, i) => (c.body ? `${i + 1}. ${c.message}\n\n   ${c.body}` : `${i + 1}. ${c.message}`))
    .join('\n')
}

respond(gitCommitMessage())

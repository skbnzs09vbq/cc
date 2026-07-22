import { dedent } from '../_shared/utils.js'
import { complete, runCommand, remember, respond, Schema } from '../_shared/complete.js'
import { TICKET_PREFIX, COMMIT_FORMAT, COMMIT_LANG, COMMIT_ALLOW_BODY, TYPES } from '../../local/project.js'

remember(['git commit は実行しないこと'])

// ─── Phase 1: コンテキスト取得 ─────────────────────────────
phase('コンテキスト取得')

const branch = runCommand(['git rev-parse --abbrev-ref HEAD'])

let diff = runCommand(['git diff --cached'])
if (!diff || !diff.trim()) diff = runCommand(['git diff HEAD'])

// ─── Phase 2: 候補生成 ─────────────────────────────────────
phase('候補生成')

const ANGLES = ['scope', 'action', 'concise', 'descriptive']

const CANDIDATE_SCHEMA: Schema = {
  type: 'object',
  properties: {
    message: {
      type: 'string',
      description: `コミットメッセージの形式 "${COMMIT_FORMAT}" のプレースホルダをすべて埋めた1行`,
    },
    body: { type: ['string', 'null'] },
  },
  required: ['message'],
}

const candidates = ANGLES.map(angle => complete(
  dedent`
    以下の差分から、"${angle}" の切り口でコミットメッセージ候補を1つ生成してください。

    コミットメッセージの形式: "${COMMIT_FORMAT}"
    {type} を使う場合の選択肢: ${TYPES.join(' / ')}
    TICKET_PREFIX: ${TICKET_PREFIX}
    ブランチ名: ${branch}

    差分:
    ${diff}

    説明文は ${COMMIT_LANG} で簡潔に。body は${COMMIT_ALLOW_BODY ? '含めてよい' : '含めない'}。
  `,
  CANDIDATE_SCHEMA
))

// ─── Phase 3: 出力の整形 ─────────────────────────────────
phase('出力の整形')

const output = candidates.map((c: { message: string, body: string | null }, i: number) =>
  c.body ? `${i + 1}. ${c.message}\n\n   ${c.body}` : `${i + 1}. ${c.message}`
).join('\n')

respond(output)

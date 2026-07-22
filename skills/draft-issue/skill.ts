import { dedent } from '../_shared/utils.js'
import { complete, generate, buildCommandPrompt, runCommand, askUser, respond, exit, Schema } from '../_shared/complete.js'
import { parseArgs } from '../_shared/args.js'
import { ISSUE_TEMPLATE, BASE_BRANCH } from '../../local/project.js'

const input = parseArgs()

// ─── Phase 1: 項目抽出 ─────────────────────────────────────
phase('項目抽出')

const fieldNames = [...ISSUE_TEMPLATE.matchAll(/^#{1,2}\s+(.+)$/gm)].map(m => m[1].replace(/[{}]/g, '').trim())

const FIELDS_SCHEMA: Schema = {
  type: 'object',
  properties: Object.fromEntries(fieldNames.map(name => [name, { type: ['string', 'null'] }])),
  required: fieldNames,
}

let fields = complete(
  dedent`
    以下の入力から、ISSUE_TEMPLATE の各項目に当てはまる情報を抽出してください。
    根拠なく推測で埋めず、判断できない項目は null にしてください。

    入力:
    ${input}

    ISSUE_TEMPLATE:
    ${ISSUE_TEMPLATE}
  `,
  FIELDS_SCHEMA
)

// ─── Phase 2: 背景調査 ─────────────────────────────────────
phase('背景調査')

const researchTopic = generate(dedent`
  次の入力から、背景調査に使う調査テーマを抽出してください。

  ${input}
`)

Skill("research", researchTopic)

// ─── Phase 3: 実装状況の確認 ───────────────────────────────
phase('実装状況の確認')

runCommand(['git fetch origin'])

const ALREADY_IMPLEMENTED_SCHEMA: Schema = {
  type: 'object',
  properties: {
    implemented: {
      type: 'boolean',
      description: 'この issue で書こうとしている内容が、origin/{BASE_BRANCH} の最新コードにすでに実装済み（または一部実装済み）かどうか',
    },
    summary: {
      type: ['string', 'null'],
      description: 'implemented が true の場合、その概要。false の場合は null',
    },
  },
  required: ['implemented', 'summary'],
}

const alreadyImplemented = complete(
  buildCommandPrompt(
    `origin/${BASE_BRANCH} の最新コードを確認し、この issue で書こうとしている内容がすでに実装済みでないか確認してください。`,
    [`git log --oneline origin/${BASE_BRANCH} -20`, `git diff origin/${BASE_BRANCH}`]
  ),
  ALREADY_IMPLEMENTED_SCHEMA
)

if (alreadyImplemented.implemented) {
  const shouldContinue = askUser<boolean>(
    dedent`
      origin/${BASE_BRANCH} を確認したところ、以下の内容はすでに実装済みの可能性があります。
      ${alreadyImplemented.summary}
      このまま issue 下書きの作成を続けますか？
    `,
    { type: 'boolean' }
  )
  if (!shouldContinue) {
    exit('既に実装済みの可能性があるため、issue 下書きの作成を中止しました。')
  }
}

// ─── Phase 4: 不足項目の質問 ────────────────────────────────
phase('不足項目の質問')

const missingFields = complete(
  'fields のうち、根拠なく推測でしか埋められない項目を列挙してください。すべて確定できていれば null を返してください。',
  { type: ['array', 'null'], items: { type: 'string' } }
)

if (missingFields) {
  const ANSWERS_SCHEMA: Schema = {
    type: 'object',
    properties: Object.fromEntries(missingFields.map((f: string) => [f, { type: 'string' }])),
    required: missingFields,
  }

  const answers = askUser<Record<string, string>>(
    dedent`
      以下の項目は入力・調査だけでは判断できませんでした。教えてください。
      ${missingFields.map((f: string) => `- ${f}`).join('\n')}
    `,
    ANSWERS_SCHEMA
  )
  fields = { ...fields, ...answers }
}

// ─── Phase 5: 出力 ──────────────────────────────────────────
phase('出力')

const issueDraft = generate(
  dedent`
    fields の内容を ISSUE_TEMPLATE に当てはめ、issue 下書き（タイトル＋本文）の Markdown を出力してください。

    ISSUE_TEMPLATE:
    ${ISSUE_TEMPLATE}

    fields:
    ${JSON.stringify(fields)}
  `
)

respond(issueDraft)

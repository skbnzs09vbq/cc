import { getArgs } from '../_shared/args.js'
import { type Schema, complete, respond } from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'
import { dedent } from '../_shared/utils.js'

const SIMILARITY_CRITERIA: Record<1 | 2 | 3, string> = {
  1: '同じ話題・領域について触れているだけでも重複とみなす（緩い基準）',
  2: '表現・形式が異なっていても、指している内容・要求が実質的に同じなら重複とみなす（標準の基準）',
  3: '内容・文言がほぼ同一と言えるものだけを重複とみなす（厳しい基準）',
}

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      description: '重複チェック対象の項目一覧（文字列でもオブジェクトでもよい）',
    },
    existing: {
      type: ['array', 'string'],
      description: '既存の項目一覧\nこの中に実質的に同じ内容があれば重複として除外される',
    },
    similarityLevel: {
      type: ['integer', 'null'],
      enum: [1, 2, 3, null],
      description: `重複とみなす基準の厳しさ\n未指定なら 2\n1: ${SIMILARITY_CRITERIA[1]} / 2: ${SIMILARITY_CRITERIA[2]} / 3: ${SIMILARITY_CRITERIA[3]}`,
    },
  },
  required: ['items', 'existing', 'similarityLevel'],
} as const satisfies Schema

const NEW_INDICES_SCHEMA = {
  type: 'object',
  properties: {
    newIndices: {
      type: 'array',
      items: { type: 'integer' },
      description:
        'items のうち、existing のどれとも重複しない（本当に新規の）項目の、0始まりのインデックス一覧',
    },
  },
  required: ['newIndices'],
} as const satisfies Schema

export function dedupItems(args: Infer<typeof ARGS_SCHEMA>) {
  const { items, existing } = args
  const level = args.similarityLevel ?? 2

  const result = complete(
    dedent`
      以下の「対象一覧」の各項目について、「既存一覧」のいずれかと重複しているか判定してください

      重複の判定基準: ${SIMILARITY_CRITERIA[level]}

      重複していない（本当に新規の）項目の、対象一覧における0始まりのインデックスだけを返してください

      対象一覧:
      ${JSON.stringify(items, null, 2)}

      既存一覧:
      ${typeof existing === 'string' ? existing || '(なし)' : JSON.stringify(existing, null, 2)}
    `,
    NEW_INDICES_SCHEMA,
  )

  return result.newIndices.map((i) => items[i])
}

respond(dedupItems(getArgs(ARGS_SCHEMA)))

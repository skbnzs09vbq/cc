import { GUIDELINES, PROJECT_ROOT } from '../../local/project.js'
import { dedupItems } from '../dedup-items/skill.js'
import { getArgs } from '../_shared/args.js'
import { type Schema, complete, readFile, respond } from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'
import { dedent } from '../_shared/utils.js'

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: { type: 'string' },
      description: 'ギャップの有無を確認したい項目一覧（仕様を分解したもの等）',
    },
    existing: {
      type: ['array', 'null'],
      items: { type: 'string' },
      description:
        '既に存在する・対応済みの項目一覧。null の場合、workingDir（未指定なら project.ts の PROJECT_ROOT）/GUIDELINES から実際のコードベースの実装状況を調べて existing の代わりに使う',
    },
    workingDir: {
      type: ['string', 'null'],
      description:
        '実装状況を調査するディレクトリ（worktree 等）。existing が null の場合のみ使う。未指定なら project.ts の PROJECT_ROOT',
    },
    similarityLevel: {
      type: ['integer', 'null'],
      enum: [1, 2, 3, null],
      description:
        '対応済みとみなす基準の厳しさ（dedup-items にそのまま渡す）。1: 緩い、2: 標準（既定値）、3: 厳しい。未指定なら 2',
    },
  },
  required: ['items', 'existing', 'workingDir', 'similarityLevel'],
} as const satisfies Schema

export function findSpecGaps(args: Infer<typeof ARGS_SCHEMA>): string[] {
  const { items, existing, similarityLevel } = args
  const workingDir = args.workingDir ?? PROJECT_ROOT

  const allExisting = existing
    ? [...existing]
    : [
        complete(
          dedent`
            プロジェクト ${workingDir} の実際のコードベースを調査し、既に対応・実装されている内容
            （ディレクトリ構成・主要機能ごとの実装状況・TODO・既知の問題等）を箇条書きで簡潔にまとめてください。

            既存の実装指針（あれば踏まえる）:
            ${exists(GUIDELINES) ? readFile(GUIDELINES) || '（なし）' : '（なし）'}

            確認対象の項目一覧:
            ${JSON.stringify(items, null, 2)}
          `,
        ),
      ]

  return dedupItems({ items, existing: allExisting, similarityLevel })
}

respond(findSpecGaps(getArgs(ARGS_SCHEMA)))

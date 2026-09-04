import { TEST_POLICY_URL } from '../../local/project.js'
import { getArgs } from '../_shared/args.js'
import { type Schema, complete, respond, runTool, writeFile } from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'
import { TEST_SCENARIO_PATH } from '../_shared/paths.js'
import { dedent } from '../_shared/utils.js'

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    workingDir: {
      type: ['string', 'null'],
      description: `string: ${TEST_SCENARIO_PATH} を書き出す基準ディレクトリ, null: 未指定（カレントディレクトリ）`,
    },
    content: {
      type: 'string',
      description: 'テストシナリオを起こす対象の実装内容（plan.md 本文・issue 本文・実装内容テキスト等）',
    },
  },
  required: ['workingDir', 'content'],
} as const satisfies Schema

export const SCENARIOS_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '何を確認するシナリオかを一文で' },
      layer: {
        type: 'string',
        enum: ['UI', 'API'],
        description: 'UI: 画面操作で確認するシナリオ, API: エンドポイントを直接叩いて確認するシナリオ',
      },
      category: {
        type: 'string',
        enum: ['正常系', '異常系', '境界値'],
        description: 'シナリオの種別',
      },
      precondition: { type: 'string', description: '検証開始時に整っている必要がある状態' },
      steps: {
        type: 'array',
        items: { type: 'string' },
        description:
          'そのまま実行できる粒度の手順。UI なら画面操作、API ならメソッド・パス・リクエスト内容（認証情報含む）を順に並べたもの',
      },
      expected: {
        type: 'string',
        description:
          '手順を実行した結果、観測できるべき状態。API ならステータスコードとレスポンス body の要点、UI なら画面表示や保存されたデータ',
      },
    },
    required: ['title', 'layer', 'category', 'precondition', 'steps', 'expected'],
  },
  description: '抜け漏れなく列挙したテストシナリオ',
} as const satisfies Schema

export const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    includesTests: {
      type: 'boolean',
      description: '実装内容にテストの実装そのものが含まれるか',
    },
    testPolicy: {
      type: ['string', 'null'],
      description: 'TEST_POLICY_URL から取得したテスト方針。取得しなかった場合は null',
    },
    scenarios: SCENARIOS_SCHEMA,
  },
  required: ['includesTests', 'testPolicy', 'scenarios'],
} as const satisfies Schema

export type TestScenarioResult = Infer<typeof RESULT_SCHEMA>
export type TestScenario = Infer<typeof SCENARIOS_SCHEMA>[number]

export function toMarkdown(scenarios: TestScenario[]): string {
  const sections = scenarios.map((s, i) =>
    dedent`
      ## ${i + 1}. [${s.layer}/${s.category}] ${s.title}

      - 前提: ${s.precondition}
      - 手順:
      ${s.steps.map((step, n) => `  ${n + 1}. ${step}`).join('\n')}
      - 期待: ${s.expected}
    `,
  )

  return dedent`
    # テストシナリオ

    ${sections.join('\n\n')}
  `
}

export function parseMarkdown(markdown: string): TestScenario[] {
  return markdown
    .split(/^## /m)
    .slice(1)
    .flatMap((block) => {
      const lines = block.split('\n')
      const header = lines[0].match(/^\d+\.\s*\[(UI|API)\/([^\]]+)\]\s*(.+)$/)
      if (!header) return []

      const [, layer, category, title] = header
      const find = (label: string) =>
        lines.find((l) => l.startsWith(`- ${label}: `))?.slice(`- ${label}: `.length) ?? ''

      return [
        {
          title: title.trim(),
          layer: layer as TestScenario['layer'],
          category: category.trim() as TestScenario['category'],
          precondition: find('前提'),
          steps: lines
            .filter((l) => /^\s+\d+\.\s/.test(l))
            .map((l) => l.replace(/^\s+\d+\.\s/, '')),
          expected: find('期待'),
        },
      ]
    })
}

export function testScenario(args: Infer<typeof ARGS_SCHEMA>): TestScenarioResult {
  const { content } = args
  const workingDir = args.workingDir ?? '.'

  // ─── Phase 1: テスト方針の確認 ─────────────────────────────
  phase('テスト方針の確認')

  const includesTests = complete(
    dedent`
      以下の実装内容にテストの実装が含まれるか判定してください

      実装内容:
      ${content}
    `,
    { type: 'boolean' } as const,
  )

  const testPolicy = TEST_POLICY_URL ? runTool(`WebFetch("${TEST_POLICY_URL}")`) : null

  // ─── Phase 2: シナリオ生成 ─────────────────────────────────
  phase('シナリオ生成')

  const { scenarios } = complete(
    dedent`
      以下の実装内容について、検証すべきテストシナリオを詳細に洗い出してください

      - 正常系だけでなく、異常系・境界値も漏れなく挙げること
      - 実装が API エンドポイントに触れる場合、画面操作（layer: UI）だけで済ませず、
        エンドポイントを直接叩くシナリオ（layer: API）も必ず挙げること。
        その際は認証・権限エラー、バリデーションエラー、必須パラメータ欠落、
        不正な型・範囲の値といった、画面からは再現しにくいケースも含めること
      - steps は実装を知らない人がそのまま実行できる粒度で書くこと
        UI なら「ログイン画面で有効なメールアドレスを入力する」、
        API なら「POST /api/users に {name: ""} を管理者トークンで送る」のように書く
      - expected は実際に観測できる形で書くこと
        UI なら画面表示・保存されたデータ、API ならステータスコードとレスポンス body の要点

      実装内容:
      ${content}

      ${testPolicy ? `テスト方針:\n${testPolicy}` : ''}
    `,
    { type: 'object', properties: { scenarios: SCENARIOS_SCHEMA }, required: ['scenarios'] } as const,
  )

  // ─── Phase 3: 保存 ─────────────────────────────────────────
  phase('保存')

  writeFile(`${workingDir}/${TEST_SCENARIO_PATH}`, toMarkdown(scenarios))

  return { includesTests, testPolicy, scenarios }
}

respond(testScenario(getArgs(ARGS_SCHEMA)))

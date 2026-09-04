import { getArgs } from '../_shared/args.js'
import { type Schema, complete, readFile, respond } from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'
import { boxTable, dedent } from '../_shared/utils.js'
import { testE2e } from '../test-e2e/skill.js'
import { E2E_SCREENSHOT_DIR, TEST_SCENARIO_PATH } from '../_shared/paths.js'
import { SCENARIOS_SCHEMA, testScenario } from '../test-scenario/skill.js'
import { testApi } from '../tests/test-api/skill.js'

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    workingDir: { type: 'string', description: '検証を実行するディレクトリ' },
    content: {
      type: 'string',
      description: '検証対象の実装内容（plan.md 本文・issue 本文・実装内容テキスト等）',
    },
    serverCommand: {
      type: ['string', 'null'],
      description:
        'string: 開発サーバーの起動コマンド（例: "npm run dev"）, null: 分からなければ（自動判定する）',
    },
    port: {
      type: ['integer', 'null'],
      description: 'integer: サーバーのポート番号, null: serverCommand が null の場合（自動判定する）',
    },
  },
  required: ['workingDir', 'content', 'serverCommand', 'port'],
} as const satisfies Schema

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    clean: { type: 'boolean', description: 'API・E2E ともに問題が無かったか' },
    summary: { type: 'string', description: '結果のサマリー（Markdown）' },
  },
  required: ['clean', 'summary'],
} as const satisfies Schema

type ResultRow = {
  layer: string
  title: string
  passed: boolean
  detail: string
  screenshot: string | null
}

export function testRun(args: Infer<typeof ARGS_SCHEMA>): Infer<typeof RESULT_SCHEMA> {
  const { workingDir, content, serverCommand, port } = args

  // ─── Phase 1: シナリオ取得 ─────────────────────────────────
  phase('シナリオ取得')

  const saved = readFile(`${workingDir}/${TEST_SCENARIO_PATH}`)
  const scenarios = saved
    ? complete(
        dedent`
          以下は既に洗い出し済みのテストシナリオです
          記載内容をそのまま構造化して返してください（内容の追加・削除・変更はしないこと）

          ${saved}
        `,
        SCENARIOS_SCHEMA,
      )
    : testScenario({ workingDir, content }).scenarios

  const apiScenarios = scenarios.filter((s) => s.layer === 'API')
  const uiScenarios = scenarios.filter((s) => s.layer === 'UI')

  // ─── Phase 2: API 検証 ─────────────────────────────────────
  phase('API 検証')

  const api = apiScenarios.length
    ? testApi({ workingDir, scenarios: apiScenarios, baseUrl: null, serverCommand, port })
    : null

  // ─── Phase 3: E2E 検証 ─────────────────────────────────────
  phase('E2E 検証')

  const uiDescription = uiScenarios
    .map(
      (s) =>
        `- [${s.category}] ${s.title}\n  前提: ${s.precondition}\n  手順: ${s.steps.join(' → ')}\n  期待: ${s.expected}`,
    )
    .join('\n')

  const e2e = uiScenarios.length
    ? testE2e({
        workingDir,
        description: uiDescription,
        scenarioTitles: uiScenarios.map((s) => s.title),
        serverCommand,
        port,
      })
    : null

  // ─── Phase 4: 集約 ─────────────────────────────────────────
  phase('集約')

  const scenarioByTitle = new Map(scenarios.map((s) => [s.title, s]))

  const rows: ResultRow[] = [
    ...(api?.results ?? []).map((r) => ({ layer: 'API', screenshot: null, ...r })),
    ...(e2e?.results ?? []).map((r) => ({ layer: 'E2E', ...r })),
  ]

  const countOf = (layer: string, passed: boolean) =>
    rows.filter((r) => r.layer === layer && r.passed === passed).length

  const summaryTable = boxTable(
    ['層', '成功', '失敗', '計'],
    [
      ...['API', 'E2E'].map((layer) => [
        layer,
        `${countOf(layer, true)}`,
        `${countOf(layer, false)}`,
        `${countOf(layer, true) + countOf(layer, false)}`,
      ]),
      [
        '合計',
        `${rows.filter((r) => r.passed).length}`,
        `${rows.filter((r) => !r.passed).length}`,
        `${rows.length}`,
      ],
    ],
    [2],
  )

  const label = (title: string) => {
    const scenario = scenarioByTitle.get(title)
    return scenario ? `[${scenario.layer}/${scenario.category}] ${title}` : title
  }

  const failed = rows.filter((r) => !r.passed)
  const passed = rows.filter((r) => r.passed)

  const failedSection = failed
    .map((r) =>
      dedent`
        ❌ ${label(r.title)}
          期待: ${scenarioByTitle.get(r.title)?.expected ?? '(不明)'}
          実際: ${r.detail}${r.screenshot ? `\n   証跡: ${r.screenshot}` : ''}
      `,
    )
    .join('\n\n')

  const clean = failed.length === 0

  return {
    clean,
    summary: dedent`
      ## 検証結果 ${clean ? '✅ 全 ' + rows.length + ' 件成功' : `❌ ${rows.length}件中${failed.length}件失敗`}

      ${summaryTable}

      ${failed.length ? `### 失敗\n\n${failedSection}\n` : ''}
      ${
        passed.length
          ? `### 成功した${passed.length}件\n\n${passed.map((r) => `✅ ${label(r.title)}${r.detail ? ` (${r.detail})` : ''}`).join('\n')}`
          : ''
      }

      ${e2e?.screenshots.length ? `証跡: ${workingDir}/${E2E_SCREENSHOT_DIR}/ (${e2e.screenshots.length}枚)` : ''}
    `,
  }
}

respond(testRun(getArgs(ARGS_SCHEMA)))

import { getArgs } from '../../shared/args.js'
import { type Schema, complete, readFile, respond, runCommand, writeFile } from '../../shared/complete.js'
import type { Infer } from '../../shared/infer.js'
import { boxTable, dedent } from '../../shared/utils.js'
import { testE2e } from '../../test/e2e/skill.js'
import {
  API_SPEC_PATH,
  TEST_RUN_DIR,
  TEST_SCENARIO_PATH,
} from '../../shared/paths.js'
import { parseMarkdown, testScenario } from '../../test/scenario/skill.js'
import { testApi } from '../../test/api/skill.js'

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
    clean: { type: 'boolean', description: 'API・E2E ともに問題が無かったか（pending は含めない）' },
    pending: {
      type: 'integer',
      description: '未確定仕様のため TODO/スタブになっており、保留とした検証の件数',
    },
    summary: { type: 'string', description: '結果のサマリー（Markdown）' },
    runDir: {
      type: 'string',
      description: 'テスト本体・シナリオ・結果・証跡をまとめた run ディレクトリ',
    },
  },
  required: ['clean', 'pending', 'summary', 'runDir'],
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
  const parsed = saved ? parseMarkdown(saved) : []
  const scenarios = parsed.length ? parsed : testScenario({ workingDir, content }).scenarios

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

  const stubbed = complete(
    dedent`
      以下の失敗のうち、実装が TODO・スタブのまま残っている（仕様が未確定で実装されていない）ことが
      原因のものを選び、その title を返してください
      実装済みなのに期待通り動いていないものは含めないでください

      失敗した検証:
      ${JSON.stringify(rows.filter((r) => !r.passed))}
    `,
    { type: 'array', items: { type: 'string' } } as const,
  )

  const stateOf = (r: ResultRow) =>
    r.passed ? 'passed' : stubbed.includes(r.title) ? 'pending' : 'failed'

  const countOf = (layer: string, state: string) =>
    rows.filter((r) => r.layer === layer && stateOf(r) === state).length
  const totalOf = (state: string) => rows.filter((r) => stateOf(r) === state).length

  const summaryTable = boxTable(
    ['layer', 'passed', 'failed', 'pending', 'total'],
    [
      ...['API', 'E2E'].map((layer) => [
        layer,
        `${countOf(layer, 'passed')}`,
        `${countOf(layer, 'failed')}`,
        `${countOf(layer, 'pending')}`,
        `${rows.filter((r) => r.layer === layer).length}`,
      ]),
      [
        'total',
        `${totalOf('passed')}`,
        `${totalOf('failed')}`,
        `${totalOf('pending')}`,
        `${rows.length}`,
      ],
    ],
    [2],
  )

  const label = (title: string) => {
    const scenario = scenarioByTitle.get(title)
    return scenario ? `[${scenario.layer}/${scenario.category}] ${title}` : title
  }

  const failed = rows.filter((r) => stateOf(r) === 'failed')
  const pending = rows.filter((r) => stateOf(r) === 'pending')
  const passed = rows.filter((r) => r.passed)

  const detailSection = (target: ResultRow[], icon: string) =>
    target
      .map((r) =>
        dedent`
          ${icon} ${label(r.title)}
            期待: ${scenarioByTitle.get(r.title)?.expected ?? '(不明)'}
            実際: ${r.detail}${r.screenshot ? `\n   証跡: ${r.screenshot}` : ''}
        `,
      )
      .join('\n\n')

  const clean = failed.length === 0

  const heading = clean
    ? pending.length
      ? `✅ ${passed.length} 件成功 / ⏸ ${pending.length} 件保留`
      : `✅ 全 ${rows.length} 件成功`
    : `❌ ${rows.length}件中${failed.length}件失敗`

  const summary = dedent`
    ## 検証結果 ${heading}

    ${summaryTable}

    ${failed.length ? `### 失敗\n\n${detailSection(failed, '❌')}\n` : ''}
    ${pending.length ? `### 保留（仕様未確定・TODO/スタブのまま）\n\n${detailSection(pending, '⏸')}\n` : ''}
    ${
      passed.length
        ? `### 成功した${passed.length}件\n\n${passed.map((r) => `✅ ${label(r.title)}${r.detail ? ` (${r.detail})` : ''}`).join('\n')}`
        : ''
    }
  `

  // ─── Phase 5: 成果物の集約 ─────────────────────────────────
  phase('成果物の集約')

  const runId = runCommand(['date -u +%Y%m%d-%H%M%S'])?.trim() || 'latest'
  const runDir = `${workingDir}/${TEST_RUN_DIR}/${runId}`

  runCommand([`mkdir -p ${runDir}`])
  writeFile(`${runDir}/summary.md`, summary)
  writeFile(`${runDir}/results.json`, JSON.stringify(rows.map((r) => ({ ...r, state: stateOf(r) })), null, 2))
  runCommand([
    `cp ${workingDir}/${TEST_SCENARIO_PATH} ${runDir}/scenarios.md 2>/dev/null || true`,
    `cp ${workingDir}/${API_SPEC_PATH} ${runDir}/api-spec.json 2>/dev/null || true`,
    ...(e2e?.screenshots.length
      ? [`cp -r "$(dirname "${e2e.screenshots[0]}")" ${runDir}/e2e 2>/dev/null || true`]
      : []),
  ])

  return { clean, pending: pending.length, summary: `${summary}\n\n成果物: ${runDir}`, runDir }
}

respond(testRun(getArgs(ARGS_SCHEMA)))

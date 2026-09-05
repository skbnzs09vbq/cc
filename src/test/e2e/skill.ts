import { getArgs } from '../../shared/args.js'
import {
  type Schema,
  complete,
  generate,
  respond,
  runCommand,
  writeFile,
} from '../../shared/complete.js'
import type { Infer } from '../../shared/infer.js'
import {
  E2E_SCREENSHOT_DIR,
  E2E_SCRIPT_PATH,
  WITH_SERVER_SCRIPT,
} from '../../shared/paths.js'
import { dedent } from '../../shared/utils.js'
import { checkDevServer } from '../../server/check/skill.js'

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    workingDir: { type: 'string', description: '検証を実行するディレクトリ' },
    description: {
      type: 'string',
      description: '何を検証するか（実装計画・対応内容の要約など）',
    },
    scenarioTitles: {
      type: ['array', 'null'],
      items: { type: 'string' },
      description:
        'array: description に含まれるシナリオの title 一覧（結果をシナリオ単位で返したい場合）, null: 一括判定でよい場合',
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
  required: ['workingDir', 'description', 'scenarioTitles', 'serverCommand', 'port'],
} as const satisfies Schema

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    clean: { type: 'boolean', description: '問題が一切ないかどうか' },
    findings: {
      type: ['string', 'null'],
      description: 'string: clean が false の場合の問題内容の要約, null: clean が true の場合',
    },
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '対応するシナリオの title' },
          passed: { type: 'boolean', description: 'expected 通りだったか' },
          detail: { type: 'string', description: '実際に観測された状態。失敗時は期待との差分' },
          screenshot: {
            type: ['string', 'null'],
            description: 'そのシナリオの証跡になるスクリーンショットのパス。無ければ null',
          },
        },
        required: ['title', 'passed', 'detail', 'screenshot'],
      },
      description: 'シナリオごとの検証結果（scenarioTitles が空の場合は空配列）',
    },
    screenshots: {
      type: 'array',
      items: { type: 'string' },
      description: '検証中に撮影したスクリーンショットのローカルファイルパス一覧（無ければ空配列）',
    },
  },
  required: ['clean', 'findings', 'results', 'screenshots'],
} as const satisfies Schema

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    clean: RESULT_SCHEMA.properties.clean,
    findings: RESULT_SCHEMA.properties.findings,
    results: RESULT_SCHEMA.properties.results,
  },
  required: ['clean', 'findings', 'results'],
} as const satisfies Schema

const SERVER_SCHEMA = {
  type: 'object',
  properties: {
    needed: { type: 'boolean', description: '開発サーバーの起動が必要か（静的HTML等は不要）' },
    command: {
      type: ['string', 'null'],
      description: 'string: 起動コマンド, null: needed が false の場合',
    },
    port: {
      type: ['integer', 'null'],
      description: 'integer: 待ち受けポート, null: needed が false の場合',
    },
  },
  required: ['needed', 'command', 'port'],
} as const satisfies Schema

export function testE2e(args: Infer<typeof ARGS_SCHEMA>): Infer<typeof RESULT_SCHEMA> {
  const { workingDir, description } = args
  const scriptPath = `${workingDir}/${E2E_SCRIPT_PATH}`
  const runId = runCommand(['date -u +%Y%m%d-%H%M%S'])?.trim() || 'latest'
  const screenshotDir = `${workingDir}/${E2E_SCREENSHOT_DIR}/${runId}`

  // ─── Phase 1: サーバー要否の判断 ─────────────────────────────
  phase('サーバー要否の判断')

  const server = checkDevServer({ workingDir })

  let { serverCommand, port } = args
  if (server.ready) {
    serverCommand = null
  } else if (!serverCommand) {
    const packageJson = runCommand([`cat ${workingDir}/package.json 2>/dev/null || echo ""`])
    const detected = complete(
      dedent`
        以下のディレクトリで E2E 検証を行うにあたり、開発サーバーの起動が必要か判定してください
        必要なら、起動コマンドとポート番号を package.json の scripts 等から特定してください
        静的 HTML のみで file:// で開ける場合は needed:false としてください

        package.json（無ければ空）:
        ${packageJson || '(なし)'}

        検証内容:
        ${description}
      `,
      SERVER_SCHEMA,
    )
    if (detected.needed) {
      if (!server.canStart)
        return { clean: false, findings: server.reason, results: [], screenshots: [] }
      serverCommand = detected.command
      port = detected.port
    }
  }

  // ─── Phase 2: Playwrightスクリプト作成 ─────────────────────
  phase('Playwrightスクリプト作成')

  const script = generate(dedent`
    以下の内容を検証する、Python の Playwright スクリプト（sync API）を1本書いてください

    検証内容:
    ${description}

    要件:
    - 対象が静的 HTML なら file:// URL を直接開く
      動的 Web アプリなら http://localhost:${port ?? '<port>'} を開き、page.wait_for_load_state('networkidle') を
      DOM調査・操作の前に必ず待つこと
    - まずスクリーンショットや page.content() 等で現在の状態を確認してからセレクタを特定し、
      それに基づいて操作すること（推測でセレクタを決め打ちしない）
    - 検証の要所ごとに ${screenshotDir}/<連番>_<内容>.png へスクリーンショットを保存すること
      （ディレクトリは事前に作成される）
    - ブラウザは chromium・headless で起動し、完了時に必ず閉じること
    - 検証結果（成功/失敗・具体的な問題点）を最後に print で出力すること（標準出力から後段が判定する）
    - スクリプト全文のみを返してください（説明文やMarkdownのコードブロック記法は不要）
  `)

  runCommand([`mkdir -p ${screenshotDir}`])
  writeFile(scriptPath, script)

  // ─── Phase 3: 実行 ───────────────────────────────────────────
  phase('実行')

  const output = serverCommand
    ? runCommand([
        `cd ${workingDir} && python ${WITH_SERVER_SCRIPT} --server "${serverCommand}" --port ${port} -- python ${scriptPath}`,
      ])
    : runCommand([`cd ${workingDir} && python ${scriptPath}`])

  const screenshots = (
    runCommand([`find ${screenshotDir} -type f -name '*.png' 2>/dev/null | sort`]) || ''
  )
    .split('\n')
    .filter(Boolean)

  // ─── Phase 4: 判定 ───────────────────────────────────────────
  phase('判定')

  const { scenarioTitles } = args
  const judged = complete(
    dedent`
      以下は E2E 検証スクリプトの実行結果です
      検証内容と照らして問題が無いか判定してください

      ${
        scenarioTitles
          ? dedent`
              results には以下の title ごとに1件ずつ、合否・観測された状態・証跡になるスクリーンショットのパスを入れてください

              title 一覧:
              ${scenarioTitles.map((t) => `- ${t}`).join('\n')}

              撮影されたスクリーンショット:
              ${screenshots.map((p) => `- ${p}`).join('\n') || '(なし)'}
            `
          : 'results は空配列でよいです'
      }

      検証内容:
      ${description}

      実行結果:
      ${output || '(出力なし)'}
    `,
    JUDGE_SCHEMA,
  )

  runCommand([`rm -f ${scriptPath}`])

  return { clean: judged.clean, findings: judged.findings, results: judged.results, screenshots }
}

respond(testE2e(getArgs(ARGS_SCHEMA)))

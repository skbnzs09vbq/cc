import { getArgs } from '../../shared/args.js'
import { type Schema, complete, respond, runCommand, writeFile } from '../../shared/complete.js'
import type { Infer } from '../../shared/infer.js'
import {
  API_RUNNER_SCRIPT,
  API_SPEC_PATH,
  LOCAL_DIR,
  WITH_SERVER_SCRIPT,
} from '../../shared/paths.js'
import { dedent } from '../../shared/utils.js'
import { checkDevServer } from '../../server/check/skill.js'
import { SCENARIOS_SCHEMA } from '../../test/scenario/skill.js'

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    workingDir: { type: 'string', description: '検証を実行するディレクトリ' },
    scenarios: SCENARIOS_SCHEMA,
    baseUrl: {
      type: ['string', 'null'],
      description:
        'string: API のベースURL（例 "http://localhost:3000"）, null: 未指定（port から組み立てる）',
    },
    serverCommand: {
      type: ['string', 'null'],
      description:
        'string: API サーバーの起動コマンド（例: "npm run dev"）, null: 分からなければ（自動判定する）',
    },
    port: {
      type: ['integer', 'null'],
      description: 'integer: サーバーのポート番号, null: serverCommand が null の場合（自動判定する）',
    },
  },
  required: ['workingDir', 'scenarios', 'baseUrl', 'serverCommand', 'port'],
} as const satisfies Schema

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    clean: { type: 'boolean', description: '全シナリオが期待通りだったか' },
    findings: {
      type: ['string', 'null'],
      description: 'string: clean が false の場合の問題内容の要約, null: clean が true の場合',
    },
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          passed: { type: 'boolean' },
          detail: { type: 'string' },
        },
        required: ['title', 'passed', 'detail'],
      },
      description: 'シナリオごとの検証結果',
    },
  },
  required: ['clean', 'findings', 'results'],
} as const satisfies Schema

const SPEC_SCHEMA = {
  type: 'object',
  properties: {
    auth: {
      type: ['object', 'null'],
      properties: {
        path: { type: 'string', description: 'ログイン等トークン取得エンドポイントのパス' },
        body: { type: 'string', description: '送信する body を JSON 文字列にしたもの' },
        tokenField: {
          type: 'string',
          description: 'レスポンス中のトークンの位置をドット区切りで表したもの（例 "data.token"）',
        },
        header: {
          type: 'string',
          description: '付与するヘッダ。トークン部分を {token} と書く（例 "Authorization: Bearer {token}"）',
        },
      },
      required: ['path', 'body', 'tokenField', 'header'],
      description: '認証が必要なシナリオがある場合の取得手順。どのシナリオも認証不要なら null',
    },
    requests: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '対応するシナリオの title をそのまま' },
          method: {
            type: 'string',
            enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
          },
          path: { type: 'string', description: 'ベースURLからの相対パス（クエリ文字列含む）' },
          headers: {
            type: ['string', 'null'],
            description: '追加ヘッダを JSON オブジェクト文字列にしたもの。不要なら null',
          },
          body: {
            type: ['string', 'null'],
            description: 'リクエスト body を JSON 文字列にしたもの。不要なら null',
          },
          useAuth: { type: 'boolean', description: 'auth で取得したトークンを付与するか' },
          expectedStatus: { type: 'integer', description: '期待するHTTPステータスコード' },
          expectedBody: {
            type: ['string', 'null'],
            description:
              'レスポンス body が満たすべき条件の説明。ステータスコードだけで判定できるなら null',
          },
        },
        required: [
          'title',
          'method',
          'path',
          'headers',
          'body',
          'useAuth',
          'expectedStatus',
          'expectedBody',
        ],
      },
      description: 'シナリオ1件につきリクエスト1件。シナリオの順序を保つこと',
    },
  },
  required: ['auth', 'requests'],
} as const satisfies Schema

const SERVER_SCHEMA = {
  type: 'object',
  properties: {
    needed: { type: 'boolean', description: 'API サーバーの起動が必要か（起動済みなら false）' },
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

const BODY_MATCH_SCHEMA = {
  type: 'object',
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          matched: { type: 'boolean', description: 'expectedBody の条件を満たしているか' },
          reason: { type: 'string', description: 'matched が false の場合の差分。true なら空文字' },
        },
        required: ['title', 'matched', 'reason'],
      },
    },
  },
  required: ['matches'],
} as const satisfies Schema

type RunResult = {
  title: string
  status: number | null
  body: unknown
  error: string | null
}

export function testApi(args: Infer<typeof ARGS_SCHEMA>): Infer<typeof RESULT_SCHEMA> {
  const { workingDir, scenarios, baseUrl } = args
  const specPath = `${workingDir}/${API_SPEC_PATH}`

  const apiScenarios = scenarios.filter((s) => s.layer === 'API')
  if (apiScenarios.length === 0) return { clean: true, findings: null, results: [] }

  // ─── Phase 1: サーバー要否の判断 ─────────────────────────────
  phase('サーバー要否の判断')

  const server = checkDevServer({ workingDir })
  if (!server.ready && !server.canStart)
    return {
      clean: false,
      findings: server.reason,
      results: [],
    }

  let { serverCommand, port } = args
  if (server.ready) {
    serverCommand = null
  } else if (!serverCommand) {
    const packageJson = runCommand([`cat ${workingDir}/package.json 2>/dev/null || echo ""`])
    const detected = complete(
      dedent`
        以下のディレクトリで API 検証を行うにあたり、API サーバーの起動が必要か判定してください
        必要なら、起動コマンドとポート番号を package.json の scripts 等から特定してください

        package.json（無ければ空）:
        ${packageJson || '(なし)'}

        検証するシナリオ:
        ${JSON.stringify(apiScenarios)}
      `,
      SERVER_SCHEMA,
    )
    if (detected.needed) {
      serverCommand = detected.command
      port = detected.port
    }
  }

  // ─── Phase 2: リクエスト仕様の構造化 ─────────────────────────
  phase('リクエスト仕様の構造化')

  const spec = complete(
    dedent`
      以下のテストシナリオを、そのまま実行できる HTTP リクエスト仕様に変換してください

      - steps に書かれたメソッド・パス・リクエスト body・認証の有無を読み取ること
      - expected からは expectedStatus（必須）と expectedBody（ステータスだけで判定できるなら null）を導くこと
      - 認証が必要なシナリオが1件でもあれば auth を埋めること
      - シナリオと requests は1対1で、順序も対応させること

      シナリオ:
      ${JSON.stringify(apiScenarios, null, 2)}
    `,
    SPEC_SCHEMA,
  )

  runCommand([`mkdir -p ${workingDir}/${LOCAL_DIR}`])
  writeFile(
    specPath,
    JSON.stringify({ baseUrl: baseUrl ?? `http://localhost:${port}`, ...spec }, null, 2),
  )

  // ─── Phase 3: 実行 ───────────────────────────────────────────
  phase('実行')

  const runnerCommand = `python ${API_RUNNER_SCRIPT} ${specPath}`
  const output = serverCommand
    ? runCommand([
        `cd ${workingDir} && python ${WITH_SERVER_SCRIPT} --server "${serverCommand}" --port ${port} -- ${runnerCommand}`,
      ])
    : runCommand([`cd ${workingDir} && ${runnerCommand}`])

  const runResults: RunResult[] = JSON.parse(output || '[]')
  const runByTitle = new Map(runResults.map((r) => [r.title, r]))

  // ─── Phase 4: 判定 ───────────────────────────────────────────
  phase('判定')

  const bodyChecks = spec.requests.filter(
    (r) => r.expectedBody && runByTitle.get(r.title)?.status === r.expectedStatus,
  )
  const bodyMatches = bodyChecks.length
    ? complete(
        dedent`
          以下の各リクエストについて、実際のレスポンス body が expectedBody の条件を満たしているか判定してください

          ${JSON.stringify(
            bodyChecks.map((r) => ({
              title: r.title,
              expectedBody: r.expectedBody,
              actualBody: runByTitle.get(r.title)?.body,
            })),
            null,
            2,
          )}
        `,
        BODY_MATCH_SCHEMA,
      ).matches
    : []
  const matchByTitle = new Map(bodyMatches.map((m) => [m.title, m]))

  const results = spec.requests.map((request) => {
    const run = runByTitle.get(request.title)

    if (!run) return { title: request.title, passed: false, detail: '実行結果が見つかりません' }
    if (run.error) return { title: request.title, passed: false, detail: `実行エラー: ${run.error}` }
    if (run.status !== request.expectedStatus)
      return {
        title: request.title,
        passed: false,
        detail: `status 期待 ${request.expectedStatus} / 実際 ${run.status}`,
      }

    const match = matchByTitle.get(request.title)
    if (match && !match.matched)
      return { title: request.title, passed: false, detail: `body 不一致: ${match.reason}` }

    return { title: request.title, passed: true, detail: `status=${run.status}` }
  })

  runCommand([`rm -f ${specPath}`])

  const failed = results.filter((r) => !r.passed)

  return {
    clean: failed.length === 0,
    findings: failed.length
      ? failed.map((r) => `${r.title}: ${r.detail}`).join('\n')
      : null,
    results,
  }
}

respond(testApi(getArgs(ARGS_SCHEMA)))

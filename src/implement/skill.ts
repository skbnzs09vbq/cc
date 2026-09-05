import { TASK_TRACKER } from '../../local/project.js'
import { getArgs } from '../shared/args.js'
import {
  type Schema,
  complete,
  readFile,
  remember,
  respond,
  runCommand,
  runTool,
} from '../shared/complete.js'
import type { Infer } from '../shared/infer.js'
import { dedent } from '../shared/utils.js'
import { testScenario } from '../test/scenario/skill.js'

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: { type: 'string' },
      description: '実装で対応した内容の箇条書き\n抜け漏れなくすべて列挙する',
    },
  },
  required: ['items'],
} as const satisfies Schema

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    workingDir: {
      type: ['string', 'null'],
      description: 'string: 実装を行う作業ディレクトリ, null: 未指定（カレントディレクトリ）',
    },
    input: {
      type: 'string',
      description: 'plan.md のパス・タスクURL・実装内容テキストのいずれか',
    },
  },
  required: ['workingDir', 'input'],
} as const satisfies Schema

export function implement(args: Infer<typeof ARGS_SCHEMA>): string {
  const workingDir = args.workingDir ?? '.'
  const { input } = args

  remember(['git commit・git push・PR 作成は絶対に行わないこと'])

  // ─── Phase 1: 入力種別判定 ─────────────────────────────────
  phase('入力種別判定')

  const existsLocally = runCommand([`cd "${workingDir}"; Test-Path "${input}" -PathType Leaf`])
  const isLocalPath = existsLocally != null && existsLocally.trim().toLowerCase() === 'true'

  let inputType: 'plan' | 'task_url' | 'text'
  switch (true) {
    case input.endsWith('.md') || isLocalPath:
      inputType = 'plan'
      break
    case input.startsWith('http'):
      inputType = 'task_url'
      break
    default:
      inputType = 'text'
  }

  // ─── Phase 2: 実装内容取得 ─────────────────────────────────
  phase('実装内容取得')

  let content: string | null
  switch (inputType) {
    case 'plan':
      content = readFile(`${workingDir}/${input}`)
      break
    case 'task_url':
      switch (TASK_TRACKER) {
        case 'notion':
          content = runTool(
            `ToolSearch("select:mcp__claude_ai_Notion__notion-fetch") でスキーマを取得してから notion-fetch("${input}") を呼び出す`,
          )
          break
        case 'github':
          content = runCommand([
            `cd ${workingDir} && gh issue view ${input} --json title,body,comments`,
          ])
          break
        case 'linear':
          content = runTool(`ToolSearch で Linear 用の fetch tool を探し、"${input}" を取得する`)
          break
        default:
          content = runTool(`WebFetch("${input}")`)
      }
      break
    default:
      content = input
  }

  // ─── Phase 3: テストシナリオの洗い出し ─────────────────────
  phase('テストシナリオの洗い出し')

  const { testPolicy, scenarios } = testScenario({ workingDir, content: content ?? input })

  const scenarioText = scenarios
    .map(
      (s) =>
        `- [${s.layer}/${s.category}] ${s.title}\n  前提: ${s.precondition}\n  手順: ${s.steps.join(' → ')}\n  期待: ${s.expected}`,
    )
    .join('\n')

  // ─── Phase 4: 実装 ─────────────────────────────────────────
  phase('実装')

  complete(dedent`
    作業ディレクトリ: ${workingDir}（Edit/Write/Bash 等の実際のツールでの変更はすべてこのディレクトリ内で行ってください）

    以下の内容をもとに実装してください

    content:
    ${content}

    ${testPolicy ? `testPolicy:\n${testPolicy}` : ''}

    テストシナリオ（実行せずに実装がこれらを満たすようにしてください）:
    ${scenarioText}
  `)

  const result = complete('実装で対応した内容をすべて箇条書きで列挙してください', SUMMARY_SCHEMA)

  return dedent`
    ## 実装完了

    ${result.items.map((item) => `- ${item}`).join('\n')}
  `
}

respond(implement(getArgs(ARGS_SCHEMA)))

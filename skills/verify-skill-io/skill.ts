import { getArgs } from '../_shared/args.js'
import { type Schema, complete, respond, runCommand } from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'
import { dedent } from '../_shared/utils.js'

const ARGS_SCHEMA = {
  type: 'object',
  properties: {},
  required: [],
} as const satisfies Schema

const FINDING_SCHEMA = {
  type: 'object',
  properties: {
    file: { type: 'string', description: '不一致が見つかった workflow.js のパス' },
    line: { type: ['integer', 'null'], description: '該当行（分からなければ null）' },
    callSite: { type: 'string', description: '該当する agent()/Skill() 呼び出しの要約' },
    targetSkill: { type: 'string', description: '呼び出し先の skill 名' },
    issue: { type: 'string', description: '入力または出力の不一致の具体的な内容' },
  },
  required: ['file', 'line', 'callSite', 'targetSkill', 'issue'],
} as const satisfies Schema

const FINDINGS_SCHEMA = {
  type: 'array',
  items: FINDING_SCHEMA,
} as const satisfies Schema

export function verifySkillIo(_args: Infer<typeof ARGS_SCHEMA>): string {
  // ─── Phase 1: 静的チェック（tsc） ─────────────────────────────
  phase('静的チェック')

  const tscResult =
    runCommand(['cd .claude && npx tsc --noEmit -p tsconfig.json 2>&1']) || '(エラーなし)'

  // ─── Phase 2: 呼び出し関係の収集 ─────────────────────────────
  phase('呼び出し関係の収集')

  const skillSources = runCommand([
    `cd .claude && git ls-files -z skills/*/skill.ts | sort -z | xargs -0 -I{} sh -c 'echo "=== {} ==="; cat "{}"'`,
  ])

  const workflowSources = runCommand([
    `cd .claude && git ls-files -z skills/auto-dev/*.js | sort -z | xargs -0 -I{} sh -c 'echo "=== {} ==="; cat "{}"'`,
  ])

  // ─── Phase 3: 意味的な突合 ───────────────────────────────────
  phase('意味的な突合')

  const rawFindings = Agent({
    subagent_type: 'general-purpose',
    description: 'skill間のinput/output整合性チェック',
    prompt: dedent`
      以下は .claude/skills 配下の全 skill.ts（関数化済み\nARGS_SCHEMA と export function の
      返り値の型注釈が、そのskillの正しい入出力仕様）と、.claude/skills/auto-dev 配下の
      全 workflow.js（agent(prompt, {agentType, schema}) や Skill(name, args) で他の skill を
      呼び出す実際のコード）です

      workflow.js 内の agent()/Skill() 呼び出し1件ずつについて、agentType/Skill名から
      呼び出し先の skill.ts を特定し、次の不一致が無いか確認してください

      - agent() の schema オプションが、呼び出し先 skill の export function の実際の返り値の型と
        フィールド名・必須/任意・型のいずれかで一致していない
      - agent() の prompt / Skill() の引数が、呼び出し先 skill の ARGS_SCHEMA の required な
        プロパティを過不足なく供給できていない（明らかに欠けている・型が違う場合のみ）
      - agentType / Skill 名が実在する skill フォルダを指していない

      推測での指摘はせず、実際にコードを読み比べて明確に不一致と判断できるものだけ報告してください
      該当箇所ごとに、ファイル・該当行・呼び出し内容の要約・呼び出し先 skill 名・不一致の内容を書いてください
      不一致が無ければ「不一致なし」とだけ返してください

      skill.ts 一覧:
      ${skillSources}

      workflow.js 一覧:
      ${workflowSources}
    `,
  })

  const findings = complete(
    dedent`
      以下のレビュー結果を、指定された形式の配列に整形してください（「不一致なし」であれば空配列）

      ${rawFindings}
    `,
    FINDINGS_SCHEMA,
  )

  // ─── Phase 4: 報告 ───────────────────────────────────────────
  phase('報告')

  const OUTPUT_TEMPLATE = dedent`
    ## verify-skill-io チェック結果

    ### tsc（直接 import 経由の呼び出し）

    {tsc の結果\nエラー無しならその旨}

    ### agent()/Skill() 経由の呼び出し（意味的チェック）

    #### {targetSkill} 呼び出し（{file}:{line}）
    - 呼び出し: {callSite}
    - 不一致: {issue}

    問題が無ければ「不一致なし ✓」とだけ書く
  `

  return complete(
    dedent`
      以下の結果を、出力フォーマットのテンプレートに従って1つのレポートに整形してください

      tsc の結果:
      ${tscResult}

      agent()/Skill() 呼び出しの不一致一覧:
      ${JSON.stringify(findings)}

      出力フォーマット（テンプレート）:
      ${OUTPUT_TEMPLATE}
    `,
  )
}

respond(verifySkillIo(getArgs(ARGS_SCHEMA)))

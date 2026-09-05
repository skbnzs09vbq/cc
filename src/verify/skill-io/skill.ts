import { getArgs } from '../../shared/args.js'
import { type Schema, complete, respond, runCommand } from '../../shared/complete.js'
import type { Infer } from '../../shared/infer.js'
import { dedent } from '../../shared/utils.js'

const ARGS_SCHEMA = {
  type: 'object',
  properties: {},
  required: [],
} as const satisfies Schema

const FINDING_SCHEMA = {
  type: 'object',
  properties: {
    file: { type: 'string', description: '不一致が見つかった workflow.js のパス' },
    line: { type: ['integer', 'null'], description: 'integer: 該当行, null: 分からなければ' },
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

  const workflowSources = runCommand([
    `cd .claude && git ls-files -z src/auto-dev/*.js | sort -z | xargs -0 -I{} sh -c 'echo "=== {} ==="; cat "{}"'`,
  ])

  const calledSkills = [
    ...new Set(
      [...(workflowSources ?? '').matchAll(/agentType: '([^']+)'|Skill\('([^']+)'/g)].map(
        (m) => m[1] ?? m[2],
      ),
    ),
  ]

  const index = new Map(
    (runCommand([`cd .claude && find src -name skill.ts | sed 's|^src/||; s|/skill.ts$||'`]) || '')
      .split('\n')
      .filter(Boolean)
      .map((dir) => [dir.replace(/\//g, '-'), `src/${dir}/skill.ts`]),
  )

  const located = calledSkills.map((name) => ({ name, path: index.get(name) ?? null }))
  const missing = located.filter((s) => !s.path).map((s) => s.name)

  const skillSources = located
    .filter((s) => s.path)
    .map((s) => `=== ${s.path} ===\n${runCommand([`cat .claude/${s.path}`])}`)
    .join('\n\n')

  // ─── Phase 3: 意味的な突合 ───────────────────────────────────
  phase('意味的な突合')

  const findings = complete(
    dedent`
      以下は .claude/skills 配下の全 skill.ts（関数化済み
      ARGS_SCHEMA と export function の返り値の型注釈が、そのskillの正しい入出力仕様）と、
      .claude/src/auto-dev 配下の全 workflow.js（agent(prompt, {agentType, schema}) や
      Skill(name, args) で他の skill を呼び出す実際のコード）です

      workflow.js 内の agent()/Skill() 呼び出し1件ずつについて、agentType/Skill名から
      呼び出し先の skill.ts を特定し、次の不一致が無いか確認してください

      - agent() の schema オプションが、呼び出し先 skill の export function の実際の返り値の型と
        フィールド名・必須/任意・型のいずれかで一致していない
      - agent() の prompt / Skill() の引数が、呼び出し先 skill の ARGS_SCHEMA の required な
        プロパティを過不足なく供給できていない（明らかに欠けている・型が違う場合のみ）

      推測での指摘はせず、実際にコードを読み比べて明確に不一致と判断できるものだけ報告してください（無ければ空配列）

      呼び出し先の skill.ts:
      ${skillSources}

      workflow.js 一覧:
      ${workflowSources}
    `,
    FINDINGS_SCHEMA,
  )

  // ─── Phase 4: 報告 ───────────────────────────────────────────
  phase('報告')

  const missingSection = missing.length
    ? `\n### 実在しない呼び出し先\n\n${missing.map((name) => `- ${name}: src/${name}/skill.ts が存在しない`).join('\n')}\n`
    : ''

  const findingsSection = findings.length
    ? findings
        .map((f) =>
          dedent`
            #### ${f.targetSkill} 呼び出し（${f.file}${f.line ? `:${f.line}` : ''}）
            - 呼び出し: ${f.callSite}
            - 不一致: ${f.issue}
          `,
        )
        .join('\n\n')
    : '不一致なし ✓'

  return dedent`
    ## verify-skill-io チェック結果

    ### tsc（直接 import 経由の呼び出し）

    ${tscResult}
    ${missingSection}
    ### agent()/Skill() 経由の呼び出し（意味的チェック）

    ${findingsSection}
  `
}

respond(verifySkillIo(getArgs(ARGS_SCHEMA)))

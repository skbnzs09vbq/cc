export const meta = {
  name: 'auto-dev-direction',
  description:
    '仕様と実装状況を把握し、1つの角度を選んで不足分のissueを作成する（できるだけ細かく分割する）',
  phases: [
    { title: '仕様・現状把握' },
    { title: '次のissue選定' },
    { title: 'issue作成' },
  ],
}

function dedent(strings, ...values) {
  const bodyLines = strings.flatMap(s => s.split('\n').slice(1)).filter(l => l.trim())
  const indent = bodyLines.length ? Math.min(...bodyLines.map(l => l.match(/^ */)[0].length)) : 0
  const strip = s => s.split('\n').map((l, i) => i === 0 ? l : (l.startsWith(' '.repeat(indent)) ? l.slice(indent) : l)).join('\n')
  return strings.reduce((acc, s, i) => acc + strip(s) + (i < values.length ? values[i] : ''), '').trim()
}

const MAX_ISSUE_COUNT = 15

const GRANULARITY_NOTE = dedent`
  - 角度（機能領域・レイヤー・仕様の一部など）は1つだけ選ぶ
    - 選んだ角度の中だけを探索する、他の角度は次回に残してよい

  - 選んだ角度の中身は、できるだけ細かい粒度のissue候補に分割する
    - 技術的な理由（強い依存関係など）で一緒に実装せざるを得ない場合のみ1つにまとめる
    - issue候補は最大${MAX_ISSUE_COUNT}件まで

  - 各issueに優先度（high/middle/low）を付ける
    - high  : 他のissueが依存する基盤issue（技術選定・スキャフォールディング等）
    - low   : 基盤issueの完了に依存するissue
    - middle: それ以外（依存なく単独で進められるもの）

  - 技術選定がまだなら、ここで具体的に決定してdescriptionに記載する
    - 言語・フレームワーク・内部DB・ORM・マイグレーションツール等、バージョンやライブラリ名まで
    - 既存のopen issueが既に技術選定を述べていれば、一貫性のためそれに従う
    - 仕様と .claude/local/project.ts の LINT_COMMAND/TYPECHECK_COMMAND（この環境で検証可能な言語ツールチェイン）が食い違う場合は、検証可能な方を優先しdescriptionに食い違いと判断理由を記載する
`

const ITEMS_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          rationale: { type: 'string', description: 'なぜ今このissueが必要か' },
          priority: {
            type: 'string',
            enum: ['high', 'middle', 'low'],
            description:
              '他のissueが依存する基盤issueはhigh、他issueの完了に依存するissueはlow、それ以外はmiddle',
          },
        },
        required: ['title', 'description', 'rationale', 'priority'],
      },
      description: '次に着手すべきissue候補一覧（無ければ空配列）',
    },
  },
  required: ['items'],
}

// ─── Phase 1: 仕様・現状把握 ─────────────────────────────
phase('仕様・現状把握')

const specResearch = await agent(
  'project-wide spec/requirements',
  { agentType: 'research', phase: '仕様・現状把握', label: '仕様調査' }
)

const existingIssues = await agent(
  JSON.stringify({ type: null, assigneeOnly: false }),
  { agentType: 'issue-list', phase: '仕様・現状把握', label: '既存issue確認' }
)

// ─── Phase 2: 次のissue選定 ─────────────────────────────
phase('次のissue選定')

let implementationStatus = null
let items = (await agent(
  dedent`
    以下の仕様調査結果と既存のopen issueを比較し、まだissue化されていない不足機能があれば
    次のissue候補として提案してください（無ければ空のitems配列）

    ${GRANULARITY_NOTE}

    仕様調査結果:
    ${specResearch}

    既存のopen issue:
    ${existingIssues}
  `,
  { schema: ITEMS_SCHEMA, phase: '次のissue選定', label: '不足機能の判定' }
)).items

if (items.length === 0) {
  implementationStatus = await agent(
    dedent`
      .claude/local/project.ts の PROJECT_ROOT/GUIDELINES を確認し、プロジェクト全体の実装状況を調査してください
      （ディレクトリ構成、主要機能ごとの実装状況、未実装/TODO/既知の問題、コード品質・設計上の問題など、
      仕様に明記された機能に限らず、調査中に見つかった問題・技術的負債も含める）
      調査結果をそのまま返してください
    `,
    { phase: '次のissue選定', label: '実装状況調査' }
  )

  items = (await agent(
    dedent`
      以下の仕様調査結果と実装状況をもとに、不足していると判断できる部分があれば
      次のissue候補として提案してください（無ければ空のitems配列）
      既存のopen issueと重複させないこと

      ${GRANULARITY_NOTE}

      仕様調査結果:
      ${specResearch}

      実装状況:
      ${implementationStatus}

      既存のopen issue:
      ${existingIssues}
    `,
    { schema: ITEMS_SCHEMA, phase: '次のissue選定', label: '実装ギャップの判定' }
  )).items
}

if (items.length === 0) {
  const existingPrs = await agent(
    JSON.stringify({ assignee: null }),
    { agentType: 'git-pr-list', phase: '次のissue選定', label: '既存PR確認' }
  )

  items = (await agent(
    dedent`
      以下のopen PR一覧を確認し、問題（コンフリクト等）があれば、それを解消するためのissue候補を
      提案してください（無ければ空のitems配列）
      issue候補は最大${MAX_ISSUE_COUNT}件まで提案する

      open PR一覧:
      ${existingPrs}
    `,
    { schema: ITEMS_SCHEMA, phase: '次のissue選定', label: 'PR問題の判定' }
  )).items
}

log(`次のissue候補 ${items.length} 件`)

// ─── Phase 3: issue作成 ────────────────────────────────────
phase('issue作成')

const toCreate = items.slice(0, MAX_ISSUE_COUNT)

const created = await pipeline(
  toCreate,

  (item, _originalItem, index) =>
    agent(
      JSON.stringify({
        type: null,
        title: `[${item.priority}] ${item.title}`,
        body: `## Description\n${item.description}\n\n## Rationale\n${item.rationale}`,
        tempFilePath: `scratchpad/issue_body_${index}.md`,
      }),
      { agentType: 'issue-create', phase: 'issue作成', label: `作成: ${item.title}` }
    ).then((url) => `${item.title}: created (${url})`)
)

log(`${created.filter(Boolean).length} 件のissueを処理`)

return { created: created.filter(Boolean) }

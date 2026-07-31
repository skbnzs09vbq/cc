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

const SPEC_ITEMS_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: { type: 'string' },
      description: '仕様に含まれる個々の要求・機能を1件ずつの項目に分解した一覧',
    },
  },
  required: ['items'],
}

// ─── Phase 1: 仕様・現状把握 ─────────────────────────────
phase('仕様・現状把握')

const specSummary = await agent(
  'project-wide spec/requirements',
  { agentType: 'research', phase: '仕様・現状把握', label: '仕様調査' }
)

const specItems = (await agent(
  dedent`
    以下の調査結果から、仕様に含まれる個々の要求・機能を1件ずつの項目に分解してください。

    ${specSummary}
  `,
  { schema: SPEC_ITEMS_SCHEMA, phase: '仕様・現状把握', label: '仕様項目の抽出' }
)).items

const existingIssuesRaw = await agent(
  JSON.stringify({ type: null, assigneeOnly: false, structured: false, withDependencies: false }),
  { agentType: 'issue-list', phase: '仕様・現状把握', label: '既存issue確認' }
)
const existingIssues = JSON.parse(existingIssuesRaw || '[]')

// ─── Phase 2: 次のissue選定 ─────────────────────────────
phase('次のissue選定')

let gapsRaw = await agent(
  JSON.stringify({ items: specItems, existing: existingIssues, workingDir: null, similarityLevel: 2 }),
  { agentType: 'find-spec-gaps', phase: '次のissue選定', label: '不足機能の判定' }
)
let gaps = JSON.parse(gapsRaw || '[]')

if (gaps.length === 0) {
  gapsRaw = await agent(
    JSON.stringify({ items: specItems, existing: null, workingDir: null, similarityLevel: 2 }),
    { agentType: 'find-spec-gaps', phase: '次のissue選定', label: '実装ギャップの判定' }
  )
  gaps = JSON.parse(gapsRaw || '[]')
}

let items = []

if (gaps.length > 0) {
  items = (await agent(
    dedent`
      以下の不足項目一覧をもとに、issue として整形してください

      ${GRANULARITY_NOTE}

      不足項目一覧:
      ${JSON.stringify(gaps)}
    `,
    { schema: ITEMS_SCHEMA, phase: '次のissue選定', label: 'issue候補の整形' }
  )).items
} else {
  const existingPrs = await agent(
    JSON.stringify({ assignee: null, number: null, state: null }),
    { agentType: 'git-pr-list', phase: '次のissue選定', label: '既存PR確認' }
  )

  const conflictingPrs = JSON.parse(existingPrs || '[]').filter((pr) => pr.mergeable === 'CONFLICTING')

  if (conflictingPrs.length > 0) {
    items = (await agent(
      dedent`
        以下のコンフリクトしているPR一覧を解消するためのissue候補を提案してください

        コンフリクトしているPR一覧:
        ${JSON.stringify(conflictingPrs)}
      `,
      { schema: ITEMS_SCHEMA, phase: '次のissue選定', label: 'PR問題の判定' }
    )).items
  }
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

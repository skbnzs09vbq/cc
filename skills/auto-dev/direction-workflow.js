export const meta = {
  name: 'auto-dev-direction',
  description: '仕様と実装状況を把握し、1つの観点に絞って足りない部分をissueとして作成する（粒度を細かく分け、複数作成する）',
  phases: [
    { title: '仕様・現状把握' },
    { title: '次issue判定' },
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
  - 対象は不足している観点（例: 特定の機能領域・レイヤー・仕様の一部分など）を1つだけ選び、その観点の範囲内でのみ探してください（他の観点は次回以降に回してよい。今回見つけた範囲をすべてissue化しようとしないこと）
  - 選んだ観点の中で見つかった課題は、できるだけ粒度を細かく分割し、複数のissue候補として提案してください
  - ただし同時に実装しないと技術的に問題がある（強い依存関係がある等）場合のみ、1つのissueにまとめてください
  - 提案するissue候補は多くても${MAX_ISSUE_COUNT}件程度にしてください
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
        },
        required: ['title', 'description', 'rationale'],
      },
      description: '次に着手すべき issue 候補一覧（無ければ空配列）',
    },
  },
  required: ['items'],
}

const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    aborted: { type: 'boolean' },
    reason: { type: ['string', 'null'] },
    draft: { type: ['string', 'null'], description: 'issue下書き（1行目がタイトル、以降が本文）の Markdown' },
  },
  required: ['aborted', 'reason', 'draft'],
}

// ─── Phase 1: 仕様・現状把握 ──────────────────────────────────
phase('仕様・現状把握')

const specResearch = await agent(
  dedent`
    Skill("research", "プロジェクト全体の仕様・要件") を実行し、仕様に関する情報を取得してください
    取得した内容をそのまま返してください
  `,
  { phase: '仕様・現状把握', label: '仕様調査' }
)

const existingIssues = await agent(
  dedent`
    .claude/local/project.ts の TARGET_REPO を確認し、
    gh issue list --repo <TARGET_REPO> --state open --json title,body を実行し、結果をそのまま返してください
  `,
  { phase: '仕様・現状把握', label: '既存issue確認' }
)

// ─── Phase 2: 次issue判定 ─────────────────────────────────────
phase('次issue判定')

let implementationStatus = null
let items = (await agent(
  dedent`
    以下の仕様調査結果と既存 open issue を比較し、まだ issue 化されていない不足機能があれば
    次に着手すべき issue 候補として提案してください（無ければ items を空配列にしてください）

    ${GRANULARITY_NOTE}

    仕様調査結果:
    ${specResearch}

    既存 open issue:
    ${existingIssues}
  `,
  { schema: ITEMS_SCHEMA, phase: '次issue判定', label: '不足機能の判定' }
)).items

if (items.length === 0) {
  implementationStatus = await agent(
    dedent`
      .claude/local/project.ts の PROJECT_ROOT・GUIDELINES を確認し、プロジェクト全体の実装状況を調査してください
      （ディレクトリ構成・主要機能ごとの実装状況・未実装/TODO/既知の課題・コード品質や設計上の問題点を含む
      仕様に明記された機能に限らず、調査で見つかった問題点・技術的負債も対象にする）
      調査結果をそのまま返してください
    `,
    { phase: '次issue判定', label: '実装状況調査' }
  )

  items = (await agent(
    dedent`
      以下の仕様調査結果・実装状況をもとに、足りないと判断した部分があれば
      次に着手すべき issue 候補として提案してください（無ければ items を空配列にしてください）
      既存 open issue とは重複させないでください

      ${GRANULARITY_NOTE}

      仕様調査結果:
      ${specResearch}

      実装状況:
      ${implementationStatus}

      既存 open issue:
      ${existingIssues}
    `,
    { schema: ITEMS_SCHEMA, phase: '次issue判定', label: '実装不足の判定' }
  )).items
}

if (items.length === 0) {
  const existingPrs = await agent(
    dedent`
      .claude/local/project.ts の TARGET_REPO を確認し、
      gh pr list --repo <TARGET_REPO> --state open --json number,title,mergeable,url を実行し、結果をそのまま返してください
    `,
    { phase: '次issue判定', label: '既存PR確認' }
  )

  items = (await agent(
    dedent`
      以下の open PR 一覧を確認し、問題点（コンフリクト等）があれば、それを解消するための
      issue 候補として提案してください（無ければ items を空配列にしてください）
      提案するissue候補は多くても${MAX_ISSUE_COUNT}件程度にしてください

      open PR 一覧:
      ${existingPrs}
    `,
    { schema: ITEMS_SCHEMA, phase: '次issue判定', label: 'PRの問題点判定' }
  )).items
}

log(`次のissue候補 ${items.length}件`)

// ─── Phase 3: issue作成 ───────────────────────────────────────
phase('issue作成')

const toCreate = items.slice(0, MAX_ISSUE_COUNT)

const created = await pipeline(
  toCreate,

  item => agent(
    dedent`
      issueにしたい内容:
      タイトル案: ${item.title}
      内容: ${item.description}
      理由: ${item.rationale}
    `,
    { agentType: 'draft-issue', schema: DRAFT_SCHEMA, phase: 'issue作成', label: item.title }
  ),

  async (draftResult, item) => {
    if (draftResult.aborted) return `${item.title}: 中止（${draftResult.reason}）`

    const url = await agent(
      dedent`
        以下の issue 下書きから、.claude/local/project.ts の TARGET_REPO・ASSIGNEE を確認してから gh issue create を実行し、
        実際に issue を作成してください（1行目をタイトル、残りを本文として扱う）
        --add-assignee <ASSIGNEE> フラグで ASSIGNEE を指定して、作成と同時にアサインしてください
        本文に改行・引用符が含まれる可能性があるため、一時ファイルに書き出す等、安全な方法で実行してください
        作成した issue の URL を返してください

        下書き:
        ${draftResult.draft}
      `,
      { phase: 'issue作成', label: `${item.title} 作成` }
    )
    return `${item.title}: 作成（${url}）`
  }
)

log(`issue ${created.filter(Boolean).length}件を処理`)

return { created: created.filter(Boolean) }

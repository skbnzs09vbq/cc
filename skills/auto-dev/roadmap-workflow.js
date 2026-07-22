export const meta = {
  name: 'auto-dev-roadmap',
  description: '仕様と実装状況を把握し、完成までのロードマップを更新して次のissueを作成する',
  phases: [
    { title: '仕様・現状把握' },
    { title: 'ロードマップ更新' },
    { title: 'issue作成' },
  ],
}

// .claude/skills/_shared/utils.ts の dedent をハードコードで複製したもの
// （Workflow スクリプトはファイル import ができないため）
function dedent(strings, ...values) {
  const bodyLines = strings.flatMap(s => s.split('\n').slice(1)).filter(l => l.trim())
  const indent = bodyLines.length ? Math.min(...bodyLines.map(l => l.match(/^ */)[0].length)) : 0
  const strip = s => s.split('\n').map((l, i) => i === 0 ? l : (l.startsWith(' '.repeat(indent)) ? l.slice(indent) : l)).join('\n')
  return strings.reduce((acc, s, i) => acc + strip(s) + (i < values.length ? values[i] : ''), '').trim()
}

const ROADMAP_PATH = '.claude/local/roadmap.md'
const NEXT_ISSUE_COUNT = 1 // 1回の実行で作成する issue 数の上限（トラッカーを一気に埋めないため）

const ROADMAP_SCHEMA = {
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
      description: '次に着手すべき issue 候補一覧（優先度順）',
    },
    roadmapMarkdown: {
      type: 'string',
      description: '更新後のロードマップ全体の Markdown（完了・未着手・今回追加分が分かる形）',
    },
  },
  required: ['items', 'roadmapMarkdown'],
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

// ─── Phase: 仕様・現状把握 ────────────────────────────────────
phase('仕様・現状把握')

const context = await agent(
  dedent`
    以下を行い、調査結果をすべてまとめて返してください。

    1. Skill("research", "プロジェクト全体の仕様・要件") を実行し、仕様に関する情報を取得する
    2. .claude/local/project.ts の PROJECT_ROOT・GUIDELINES を確認し、プロジェクト全体の実装状況を調査する
       （ディレクトリ構成・主要機能ごとの実装状況・未実装/TODO/既知の課題・コード品質や設計上の問題点を含む。
       仕様に明記された機能に限らず、調査で見つかった問題点・技術的負債も対象にする）
    3. ${ROADMAP_PATH}（無ければ新規作成）を読み込み、これまでのロードマップと既に着手・完了した項目を確認する
    4. .claude/local/project.ts の TARGET_REPO を確認し、
       gh issue list --repo <TARGET_REPO> --state open --json title,body で既存の open issue も確認する
  `
)

// ─── Phase: ロードマップ更新 ──────────────────────────────────
phase('ロードマップ更新')

const roadmap = await agent(
  dedent`
    以下の調査結果をもとに、プロジェクト完成までのロードマップを更新し、次に着手すべき issue 候補を
    優先度順に提案してください。既存の open issue・ロードマップ上ですでに issue 化済みの項目とは重複させないでください。

    調査結果:
    ${context}
  `,
  { schema: ROADMAP_SCHEMA }
)

log(`ロードマップ更新、次のissue候補 ${roadmap.items.length}件`)

// ─── Phase: issue作成 ────────────────────────────────────────
phase('issue作成')

const toCreate = roadmap.items.slice(0, NEXT_ISSUE_COUNT)

const created = await pipeline(
  toCreate,

  item => agent(
    dedent`
      引数（issueにしたい内容）:
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
        以下の issue 下書きから、.claude/local/project.ts の TARGET_REPO に対して gh issue create を実行し、
        実際に issue を作成してください（1行目をタイトル、残りを本文として扱う）。
        本文に改行・引用符が含まれる可能性があるため、一時ファイルに書き出す等、安全な方法で実行してください。
        作成した issue の URL を返してください。

        下書き:
        ${draftResult.draft}
      `,
      { phase: 'issue作成', label: `${item.title} 作成` }
    )
    return `${item.title}: 作成（${url}）`
  }
)

await agent(
  dedent`
    ${ROADMAP_PATH} に、以下のロードマップ全文を書き込んでください（既存内容は上書きしてよい）。

    ${roadmap.roadmapMarkdown}
  `,
  { phase: 'issue作成' }
)

log(`issue ${created.filter(Boolean).length}件を処理`)

return { created: created.filter(Boolean) }

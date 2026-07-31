import {
  ASSIGNEE,
  BASE_BRANCH,
  GUIDELINES,
  PROJECT_ROOT,
  PR_TITLE_FORMAT,
  TARGET_REPO,
  TASK_DIR,
  TYPES,
} from '../../local/project.js'
import { getArgs } from '../_shared/args.js'
import {
  type Schema,
  askUser,
  buildCommandPrompt,
  complete,
  exit,
  generate,
  readFile,
  respond,
  runCommand,
  writeFile,
} from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'
import { dedent } from '../_shared/utils.js'

const ISSUE_SCHEMA = {
  type: 'object',
  properties: {
    id: {
      type: ['string', 'null'],
      description: 'Issue の識別子（チケット番号等）\n入力に含まれなければ null',
    },
    title: { type: 'string' },
    description: { type: 'string' },
    tasks: { type: 'array', items: { type: 'string' } },
  },
  required: ['id', 'title', 'description', 'tasks'],
} as const satisfies Schema

const PR_DUPLICATE_SCHEMA = {
  type: 'object',
  properties: {
    duplicate: {
      type: 'boolean',
      description: '実装が重複しそうな open/draft PR があるかどうか',
    },
    prs: {
      type: ['array', 'null'],
      description:
        'duplicate が true の場合、該当 PR の一覧（"PR #XX タイトル (draft/open)" 形式）\nfalse の場合は null',
      items: { type: 'string' },
    },
  },
  required: ['duplicate', 'prs'],
} as const satisfies Schema

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    planContent: {
      type: 'string',
      description: '計画 Markdown の全文',
    },
  },
  required: ['planContent'],
} as const satisfies Schema

const APPROVAL_SCHEMA = {
  type: 'object',
  properties: {
    approved: {
      type: 'boolean',
      description: 'この内容のまま進めてよいか',
    },
    feedback: {
      type: ['string', 'null'],
      description: 'approved が false の場合、修正してほしい内容\ntrue の場合は null',
    },
  },
  required: ['approved', 'feedback'],
} as const satisfies Schema

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    issueInput: { type: 'string', description: 'Issue の内容、または Issue の URL' },
    shouldContinue: {
      type: ['boolean', 'null'],
      description:
        '重複しそうな PR がある場合でも計画を続けるか\n未定なら null（ユーザーに確認する）',
    },
  },
  required: ['issueInput', 'shouldContinue'],
} as const satisfies Schema

export function planIssue(args: Infer<typeof ARGS_SCHEMA>): {
  issueId: string
  planContent: string
} {
  const { issueInput } = args
  let { shouldContinue } = args

  // ─── Phase 1: 定数と guidelines.md を読む ─────────────────────
  phase('定数と guidelines.md を読む')

  const guidelinesContent = exists(GUIDELINES) ? readFile(GUIDELINES) || '' : ''

  // ─── Phase 2: Issue 詳細取得 ─────────────────────────────────
  phase('Issue 詳細取得')

  const issue = complete(
    issueInput.startsWith('http')
      ? `"${issueInput}" 種別の読み取り専用ツールを ToolSearch で探して fetch し、Issue 情報として構造化してください`
      : `以下の入力を Issue 情報として解釈してください\n\n\n入力: ${issueInput}`,
    ISSUE_SCHEMA,
  )

  const issueLabel = issue.id ? `${issue.title} (${issue.id})` : issue.title

  // ─── Phase 3: 調査 ────────────────────────────────────────────
  phase('調査')

  const prCheck = complete(
    buildCommandPrompt(
      `"${issueLabel}" と実装が重複しそうな open/draft PR がないか確認してください`,
      [
        `gh pr list --repo ${TARGET_REPO} --state open --json number,title,headRefName,isDraft --limit 50`,
      ],
    ),
    PR_DUPLICATE_SCHEMA,
  )

  if (prCheck.duplicate) {
    shouldContinue ??= askUser(
      dedent`
        "${issueLabel}" と重複しそうな PR が見つかりました
        ${(prCheck.prs ?? []).join('\n')}
        このまま計画を続けますか？
      `,
      { type: 'boolean' } as const,
    )
    if (!shouldContinue) exit('重複する PR がある可能性があるため、計画立案を中止しました')
  }

  const relatedContext = Skill('research', `"${issueLabel}" と重複・関連しそうな既存タスク・議論`)

  const codeResult = generate(
    buildCommandPrompt(
      dedent`
        プロジェクト ${PROJECT_ROOT} で以下 issue に関連するコードを調査してください\norigin/${BASE_BRANCH} の状態を基準にする

        Issue: ${issue.title}
        説明: ${issue.description}
        タスク: ${issue.tasks.join(' / ')}

        調査内容:
        1. 関連ファイル・ディレクトリの特定（パス列挙）
        2. 現状の実装状況（何がある・何がない）
        3. 変更が必要な箇所と影響範囲
        4. 依存関係・注意点
      `,
      ['git fetch origin'],
    ),
  )

  // ─── Phase 4: 計画立案 ───────────────────────────────────────
  phase('計画立案')

  const architecture = Agent({
    subagent_type: 'Plan',
    description: `${issueLabel} の実装計画設計`,
    prompt: dedent`
      以下の Issue と調査結果をもとに、実装計画を設計してください

      ## Issue
      ID: ${issue.id || '(なし)'}
      タイトル: ${issue.title}
      説明: ${issue.description}
      タスク:
      ${issue.tasks.map((t) => `- ${t}`).join('\n')}

      ## PR 重複チェック
      ${prCheck.duplicate ? (prCheck.prs ?? []).join('\n') : '重複なし'}

      ## 関連・重複しそうな既存タスク
      ${relatedContext}

      ## コードベース調査
      ${codeResult}

      ## 既存の実装指針（あれば踏まえる）
      ${guidelinesContent || '（なし）'}
    `,
  })

  const planResult = complete(
    dedent`
      以下の設計内容を、指定のフォーマットに整形してください

      ## 設計内容
      ${architecture}

      ## 出力フォーマット

      planContent に以下の Markdown テンプレートを埋めて返してください:

      # ${issueLabel} 実装計画

      ## 概要
      {Issue の目的を 1〜2 文で要約}

      ## 実装詳細
      - \`path/to/file.ts\` — {何をするか}

      ## 実装ステップ
      1. {最初にやること}
      2. ...

      ## 懸念点・リスク
      {あれば記載\nなければ「なし」}

      ## PR 概要
      - タイトル: PR_TITLE_FORMAT「${PR_TITLE_FORMAT}」のプレースホルダをすべて埋めたタイトル（type: ${TYPES.join(' / ')}\nチケット番号のプレースホルダがあり ID があれば ${issue.id} を使う）
      - Assignee: ${ASSIGNEE}

      ## 既存作業との重複
      {PR・タスクとの重複があれば記載\nなければ省略}
    `,
    PLAN_SCHEMA,
  )

  const issueId =
    issue.id ||
    generate(
      `"${issue.title}" から、ディレクトリ名に使える短い kebab-case のスラッグを生成してください`,
    )
  let planContent = planResult.planContent

  // ─── Phase 5: 複雑な実装の場合のみ grill-me で精査する ─
  phase('複雑な実装の場合のみ grill-me で精査する')

  const isComplex = complete(
    dedent`
      以下の実装計画が、次のいずれかに該当するか判定してください\n該当しなければ false を返してください

      - 複数のドメイン・レイヤーにまたがる設計変更を伴う
      - 新しいデータモデルやアーキテクチャパターンを導入する
      - 既存の ADR や設計方針との整合性確認が必要と判断できる

      実装計画:
      ${planContent}
    `,
    { type: 'boolean' } as const,
  )

  if (isComplex) planContent = Skill('grill-me', planContent)

  // ─── Phase 6: 計画を作成して提示する ───────────────────────────
  phase('計画を作成して提示する')

  const planDir = `${TASK_DIR}${issueId}/`
  runCommand([`mkdir -p ${planDir}`])

  let approved = false
  while (!approved) {
    writeFile(`${planDir}plan.md`, planContent)

    const response = askUser(
      dedent`
        計画を作成しました（${planDir}plan.md）\nこの内容で進めてよいですか？

        ${planContent}
      `,
      APPROVAL_SCHEMA,
    )

    if (response.approved) approved = true
    else {
      planContent = complete(dedent`
        以下のフィードバックを反映して実装計画を更新してください

        実装計画:
        ${planContent}

        フィードバック:
        ${response.feedback}
      `)
    }
  }

  return { issueId, planContent }
}

respond(planIssue(getArgs(ARGS_SCHEMA)))

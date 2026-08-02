import { GUIDELINES, GUIDELINES_CATEGORY_EXAMPLES } from '../../local/project.js'
import { type Schema, complete, exit, readFile, respond, writeFile } from '../_shared/complete.js'
import { dedent } from '../_shared/utils.js'

const OUTPUT_FORMAT = dedent`
  # 実装指針

  > CC との協働で蓄積された実装方針メモ\nコーディング規約ではなく、チームの判断基準

  ## {カテゴリ名}

  ### {指針のタイトル（命令形・「〜する」形式）}

  {ルールの内容を1〜2文で記述\n箇条書きなし\n汎用的に書き、プロジェクト固有の名前は出さない}
`

const CANDIDATE_SCHEMA = {
  type: 'object',
  properties: {
    candidates: {
      type: ['array', 'null'],
      description: '該当するパターンが1つも見つからない場合は null',
      items: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: `カテゴリ名\n例: ${GUIDELINES_CATEGORY_EXAMPLES.join(' / ')}（厳密一致でなくてよく、実際に見つかったパターンに応じて増減してよい）`,
          },
          title: {
            type: 'string',
            description: '指針のタイトル\n命令形・「〜する」形式',
          },
          rule: {
            type: 'string',
            description: 'ルールの内容を1〜2文で記述\n箇条書きなし\n汎用的に書く',
          },
        },
        required: ['category', 'title', 'rule'],
      },
    },
  },
  required: ['candidates'],
} as const satisfies Schema

const MERGE_SCHEMA = {
  type: 'object',
  properties: {
    fileContent: {
      type: 'string',
      description: 'guidelines.md に書き込む Markdown 全文',
    },
    changes: {
      type: ['array', 'null'],
      description: '変更がなければ null',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['追加', '更新', '統合', '削除'] },
          title: { type: 'string' },
        },
        required: ['action', 'title'],
      },
    },
  },
  required: ['fileContent', 'changes'],
} as const satisfies Schema

export function syncGuidelines(): string {
  // ─── Phase 1: セッション分析 ────────────────────────────────
  phase('セッション分析')

  const { candidates } = complete(
    dedent`
      今このセッションで実際に交わされた、あなた（CC）とユーザーとの会話のやり取りを振り返ってください
      ツールを実行したり外部から情報を取得したりするのではなく、あなた自身がこのセッション中に経験したやり取りを
      直接思い出し、以下のパターンに当てはまる場面を探してください

      - ユーザーが CC の提案・実装を否定・修正した箇所
      - 「こうしてほしい」「こうじゃなくて」などの方向性の修正
      - 複数回同じ種類の指摘が繰り返された場面
      - 設計・実装アプローチの選択で CC と異なる方向が示された場面

      パターンが見つかったら、その出来事そのものを指針にせず、「この修正が起きたのはなぜか」を一段抽象化して、
      より広い場面に適用できる原則として表現してください

      例: 「コメントの形式を変えてしまった」という出来事があった場合、
      指針は「コメント形式を変えるな」ではなく「タスク範囲外の既存コードは変更しない」のように、
      より汎用的な原則として表現する

      以下は対象外とし、候補に含めないでください:
      - CLAUDE.md・既存スキル・ガードレールにすでに書かれているルール
      - 実装以外の手続き（ワークフロー・コミット手順・スキルの使い方など）
      - すでに存在する指針の具体例に過ぎないもの（既存の指針で包含できるなら追加しない）
    `,
    CANDIDATE_SCHEMA,
  )

  // ─── Phase 2: 既存指針の読み込み ────────────────────────────
  phase('既存指針の読み込み')

  const existingGuidelines = readFile(GUIDELINES) || ''

  if (!candidates && !existingGuidelines) exit('新規に記録すべき指針は見つかりませんでした')

  // ─── Phase 3: guidelines.md の更新 ──────────────────────────
  phase('guidelines.md の更新')

  const merged = complete(
    dedent`
      既存の実装指針と、新しく見つかった指針候補をマージして、guidelines.md の全文を生成してください

      ## 既存の内容（存在しない場合は空）
      ${existingGuidelines || '（ファイルなし\n新規作成する）'}

      ## 新しい指針候補
      ${candidates ? candidates.map((c) => `- [${c.category}] ${c.title}: ${c.rule}`).join('\n') : '（なし）'}

      ## マージ方針
      - 既存内容と新しい指針候補をマージする
      - 重複する指針（同じ趣旨のもの）は1つに統合する
      - 古くなった・矛盾する指針は削除または更新する
      - カテゴリ名は「${GUIDELINES_CATEGORY_EXAMPLES.join(' / ')}」を参考にする（厳密に一致させる必要はなく、実際の指針に応じて増減してよい）
      - 新しい指針候補のうち、既存の指針の具体例に過ぎないもの（既存の指針で包含できるもの）はマージせずに捨てる

      ## 出力フォーマット
      ${OUTPUT_FORMAT}

      fileContent には、この出力フォーマットに従った Markdown 全文を返してください
      changes には、今回の更新で実際に追加・更新・統合・削除した指針を列挙してください（変更がなければ null）
    `,
    MERGE_SCHEMA,
  )

  if (!merged.changes)
    exit(
      'guidelines.md に変更はありませんでした（新規に記録すべき指針、または更新すべき既存指針は見つかりませんでした）',
    )

  writeFile(GUIDELINES, merged.fileContent)

  // ─── Phase 4: 報告 ───────────────────────────────────────────
  phase('報告')

  const report = merged.changes.map((c) => `- [${c.action}] ${c.title}`).join('\n')

  return dedent`
    ${GUIDELINES} を更新しました

    ${report}
  `
}

respond(syncGuidelines())

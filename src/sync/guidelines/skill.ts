import { GUIDELINES, GUIDELINES_CATEGORY_EXAMPLES, PROJECT_ROOT } from '../../../local/project.js'
import { type Schema, complete, exit, readFile, respond, writeFile } from '../../shared/complete.js'
import { gitIsWorktree } from '../../shared/git.js'
import { dedent } from '../../shared/utils.js'

const LEVELS = ['must', 'should', 'nit'] as const

const LEVEL_CRITERIA = dedent`
  - must: 守らないとバグ・事故・レビュー差し戻しになるもの（ユーザーが「必ず」「絶対」等の強い言い方で示したもの）
  - should: 守った方が明確に良いが、状況によっては外してよいもの
  - nit: 動作にも保守性にも実害はなく、書き方の好みにとどまるもの
`

const OUTPUT_FORMAT = dedent`
  # 実装指針

  > CC との協働で蓄積された実装方針メモ\nコーディング規約ではなく、チームの判断基準

  ## {レベル名（${LEVELS.join(' / ')} の順に並べ、該当する指針が無いレベルの見出しは出さない）}

  ### {指針のタイトル（命令形・「〜する」形式）}（{カテゴリ名}）

  {ルールの内容を1〜2文で記述\n箇条書きなし\n汎用的に書き、プロジェクト固有の名前は出さない}
`

const CANDIDATE_SCHEMA = {
  type: 'object',
  properties: {
    candidates: {
      type: ['array', 'null'],
      description: 'array: 見つかった指針候補一覧, null: 該当するパターンが1つも見つからない場合',
      items: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: `カテゴリ名\n例: ${GUIDELINES_CATEGORY_EXAMPLES.join(' / ')}（厳密一致でなくてよく、実際に見つかったパターンに応じて増減してよい）`,
          },
          level: {
            type: 'string',
            enum: LEVELS,
            description: `指針の強さ。ユーザーの言い回しの強さから推定する\n${LEVEL_CRITERIA}`,
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
        required: ['category', 'level', 'title', 'rule'],
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
      description: 'array: 今回の更新で追加・更新・統合・削除した指針一覧, null: 変更がなければ',
      items: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['追加', '更新', '統合', '短縮', '削除'],
            description: '短縮: 内容は変えずに既存の文言を短く・汎用的に書き直した場合',
          },
          level: { type: 'string', enum: LEVELS, description: '更新後の指針のレベル' },
          title: { type: 'string' },
        },
        required: ['action', 'level', 'title'],
      },
    },
  },
  required: ['fileContent', 'changes'],
} as const satisfies Schema

export function syncGuidelines(): string {
  // ─── Phase 1: 既存指針の読み込み ────────────────────────────
  phase('既存指針の読み込み')

  const guidelinesPath = gitIsWorktree('.') ? `${PROJECT_ROOT}/${GUIDELINES}` : GUIDELINES
  const existingGuidelines = readFile(guidelinesPath) || ''

  // ─── Phase 2: セッション分析 ────────────────────────────────
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

      以下は既存の実装指針です
      ここに書かれた指針で説明できる出来事は、既に指針化されているものとして候補に挙げないでください
      ${existingGuidelines || '（まだ指針はありません）'}

      以下は対象外とし、候補に含めないでください:
      - CLAUDE.md・既存スキル・ガードレールにすでに書かれているルール
      - 実装以外の手続き（ワークフロー・コミット手順・スキルの使い方など）
      - 上記の既存指針で包含できるもの（その具体例に過ぎないもの）
    `,
    CANDIDATE_SCHEMA,
  )

  if (!candidates && !existingGuidelines) exit('新規に記録すべき指針は見つかりませんでした')

  // ─── Phase 3: guidelines.md の更新 ──────────────────────────
  phase('guidelines.md の更新')

  const merged = complete(
    dedent`
      既存の実装指針と、新しく見つかった指針候補をマージして、guidelines.md の全文を生成してください

      ## 既存の内容（存在しない場合は空）
      ${existingGuidelines || '（ファイルなし\n新規作成する）'}

      ## 新しい指針候補
      ${candidates ? candidates.map((c) => `- [${c.level}][${c.category}] ${c.title}: ${c.rule}`).join('\n') : '（なし）'}

      ## マージ方針

      新規追加より既存への統合を優先する。指針の総数はできるだけ増やさない

      - 新しい候補は、まず既存の指針に取り込めないかを検討する。趣旨が重なるもの・既存の指針の
        具体例に過ぎないものは、独立した指針にせず既存側に統合するか捨てる
      - 既存の指針を少し広げれば新しい候補も包含できる場合は、既存の指針の文言を汎用化して1本にまとめる
      - 新しい指針として独立させるのは、既存のどの指針にも含められない原則が現れた場合だけにする
      - 重複する指針（同じ趣旨のもの）は1つに統合する。レベルが食い違う場合は強い方を採る
      - 古くなった・矛盾する指針は削除または更新する

      ## 文言の方針

      指針は「どんな場面にも当てはまる原則」として書く。特定の状況の記録にしない

      - シチュエーションを詳しく書かない。発生したファイル名・関数名・機能名・具体的なやり取りの経緯は
        書かず、そこから抽出した原則だけを書く
      - 既存の文言も対象にする。冗長な説明・重複する言い回し・具体例の列挙が含まれていれば、
        意味を変えない範囲で短く書き直す
      - 似た指針どうしで語彙・言い回しが揃っていなければ統一する（同じ概念を別の言葉で書かない）
      - 1指針は1〜2文。それ以上必要なら、原則の抽出が足りていないか、2つの指針が混ざっている
      - カテゴリ名は「${GUIDELINES_CATEGORY_EXAMPLES.join(' / ')}」を参考にする（厳密に一致させる必要はなく、実際の指針に応じて増減してよい）
      - 既存の指針にレベル見出しが無い場合は、内容から以下の基準で振り分ける
      ${LEVEL_CRITERIA}

      ## 出力フォーマット
      ${OUTPUT_FORMAT}

      fileContent には、この出力フォーマットに従った Markdown 全文を返してください
      changes には、今回の更新で実際に追加・更新・統合・削除した指針を列挙してください
    `,
    MERGE_SCHEMA,
  )

  if (!merged.changes)
    exit(
      'guidelines.md に変更はありませんでした（新規に記録すべき指針、または更新すべき既存指針は見つかりませんでした）',
    )

  writeFile(guidelinesPath, merged.fileContent)

  // ─── Phase 4: 報告 ───────────────────────────────────────────
  phase('報告')

  const report = merged.changes.map((c) => `- [${c.action}][${c.level}] ${c.title}`).join('\n')

  return dedent`
    ${guidelinesPath} を更新しました

    ${report}
  `
}

respond(syncGuidelines())

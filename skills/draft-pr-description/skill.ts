import { dedent } from '../_shared/utils.js'
import { complete, runCommand, remember, respond, Schema } from '../_shared/complete.js'
import { parseArgs } from '../_shared/args.js'
import { TICKET_PREFIX, BASE_BRANCH, PR_TEMPLATE_PATH, PR_TITLE_FORMAT, PR_LANG, TYPES } from '../../local/project.js'

remember(['gh pr create や git push は行わないこと'])

const supplement = parseArgs()

// ─── Phase 1: コンテキスト取得 ─────────────────────────────
phase('コンテキスト取得')

const template = PR_TEMPLATE_PATH ? runCommand([`cat ${PR_TEMPLATE_PATH}`]) : null

const branch = runCommand(['git rev-parse --abbrev-ref HEAD'])

const log = runCommand([`git log ${BASE_BRANCH}..HEAD --oneline`])
const diffStat = runCommand([`git diff ${BASE_BRANCH}...HEAD --stat`])

// ─── Phase 2: type 判定 ─────────────────────────────────────
phase('type 判定')

const type = complete(
  dedent`
    以下の変更内容から、この PR の種別を選んでください。

    コミットログ:
    ${log}

    差分概要:
    ${diffStat}

    ${supplement ? `引数（issue 情報や補足）:\n${supplement}` : ''}
  `,
  { type: 'string', enum: TYPES }
)

// ─── Phase 3: PR タイトル・description 生成 ──────────────────
phase('PR タイトル・description 生成')

const PR_SCHEMA: Schema = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description: `PR タイトルの形式 "${PR_TITLE_FORMAT}" のプレースホルダをすべて埋めたタイトル`,
    },
    description: {
      type: 'string',
      description: 'PR テンプレートのセクション構成・HTML コメントを削除せず、内容だけを埋めた本文',
    },
  },
  required: ['title', 'description'],
}

const pr = complete(
  dedent`
    以下の情報から PR タイトルと description を生成してください。

    ## タイトル
    形式: "${PR_TITLE_FORMAT}"
    - {type}: ${type}
    - TICKET_PREFIX: ${TICKET_PREFIX}
    - ブランチ名: ${branch}
    - 概要: ${PR_LANG} で簡潔に、「何を」「どうした」かが diff から分かるように書く

    ## description
    以下のテンプレートのセクション構成・HTML コメントを削除せず、内容だけを埋めて出力してください。
    テンプレート:
    ${template || '(テンプレートが取得できなかった場合は一般的な PR description 構成で生成する)'}

    ## 参考情報
    コミットログ:
    ${log}

    差分概要:
    ${diffStat}

    ${supplement ? `引数（issue 情報や補足。diff との整合性を確認した上で反映する）:\n${supplement}` : ''}
  `,
  PR_SCHEMA
)

// ─── Phase 4: 出力フォーマットへの整形 ────────────────────────
phase('出力フォーマットへの整形')

const output = '```text\n' + dedent`
  ## PR タイトル

  ${pr.title}

  ## PR description

  ${pr.description}
` + '\n```'

respond(output)

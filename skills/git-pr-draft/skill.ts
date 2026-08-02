import {
  BASE_BRANCH,
  PR_LANG,
  PR_TEMPLATE_PATH,
  PR_TITLE_FORMAT,
  TICKET_PREFIX,
  TYPES,
} from '../../local/project.js'
import { parseArgs } from '../_shared/args.js'
import { type Schema, complete, remember, respond, runCommand } from '../_shared/complete.js'
import { dedent } from '../_shared/utils.js'

const PR_SCHEMA = {
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
} as const satisfies Schema

export function gitPrDraft(supplement: string): { title: string; description: string } {
  remember(['gh pr create や git push は行わないこと'])

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
      以下の変更内容から、この PR の種別を選んでください

      コミットログ:
      ${log}

      差分概要:
      ${diffStat}

      ${supplement ? `引数（issue 情報や補足）:\n${supplement}` : ''}
    `,
    { type: 'string', enum: TYPES } as const,
  )

  // ─── Phase 3: PR タイトル・description 生成 ──────────────────
  phase('PR タイトル・description 生成')

  const pr = complete(
    dedent`
      以下の情報から PR タイトルと description を生成してください

      ## タイトル
      形式: "${PR_TITLE_FORMAT}"
      - {type}: ${type}
      - TICKET_PREFIX: ${TICKET_PREFIX}
      - ブランチ名: ${branch}
      - 概要: ${PR_LANG} で簡潔に、「何を」「どうした」かが diff から分かるように書く

      ## description
      テンプレート:
      ${template || '(テンプレートが取得できなかった場合は一般的な PR description 構成で生成する)'}

      ## 参考情報
      コミットログ:
      ${log}

      差分概要:
      ${diffStat}

      ${supplement ? `引数（issue 情報や補足\ndiff との整合性を確認した上で反映する）:\n${supplement}` : ''}
    `,
    PR_SCHEMA,
  )

  return pr
}

const supplement = parseArgs()
respond(gitPrDraft(supplement))

import { parseArgs } from '../_shared/args.js'
import { type Schema, askUser, complete, generate, respond } from '../_shared/complete.js'
import { dedent } from '../_shared/utils.js'

const NEXT_QUESTION_SCHEMA = {
  type: 'object',
  properties: {
    done: {
      type: 'boolean',
      description: 'プラン内の未決定事項をすべて確認し尽くし、これ以上確認すべき曖昧な点が無いか',
    },
    question: {
      type: ['string', 'null'],
      description:
        'string: done が false の場合の、次に確認すべき論点を1つだけ、自分なりの推奨案とその理由を添えたもの, null: done が true の場合',
    },
  },
  required: ['done', 'question'],
} as const satisfies Schema

export function grillMe(plan: string): string {
  let updatedPlan = plan
  let done = false

  while (!done) {
    const next = complete(
      dedent`
        以下のプランに含まれる、依存関係のある未決定事項を検討してください
        コードベースを調べれば判断できる点は実際に調べて解決し、質問には含めないこと

        プラン:
        ${updatedPlan}
      `,
      NEXT_QUESTION_SCHEMA,
    )

    if (next.done || !next.question) {
      done = true
      break
    }

    const answer = askUser(next.question)

    updatedPlan = generate(dedent`
      以下のプランに、質問への回答を反映して更新してください

      プラン:
      ${updatedPlan}

      質問: ${next.question}
      回答: ${answer}
    `)
  }

  return updatedPlan
}

respond(grillMe(parseArgs()))

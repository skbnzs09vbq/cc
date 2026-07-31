import { parseArgs } from '../_shared/args.js'
import { type Schema, askUser, complete, respond } from '../_shared/complete.js'
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
        'done が false の場合、次に確認すべき論点を1つだけ、自分なりの推奨案とその理由を添えて返す（true の場合は null）',
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
        それでも曖昧・未決定な論点が残っていれば、その中から次に確認すべき1つを選び、
        自分なりの推奨案と理由を添えて question に入れてください

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

    updatedPlan = complete(dedent`
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

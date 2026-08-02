import { TARGET_REPO } from '../../local/project.js'
import { runCommand } from './complete.js'
import { dedent } from './utils.js'

export const REPO = TARGET_REPO.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '')
export const [OWNER, NAME] = REPO.split('/')

export function gitPrReviewThreads(prNumber: number, withComments: boolean): string | null {
  const nodeFields = withComments
    ? dedent`
        id
        isResolved
        comments(first: 20) {
          nodes { path body author { login } }
        }
      `
    : 'isResolved'

  return runCommand([
    dedent`
      gh api graphql -f query='
        query {
          repository(owner: "${OWNER}", name: "${NAME}") {
            pullRequest(number: ${prNumber}) {
              reviewThreads(first: 100) {
                nodes {
                  ${nodeFields}
                }
              }
            }
          }
        }
      '
    `,
  ])
}

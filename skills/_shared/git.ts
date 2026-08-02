import { TARGET_REPO } from '../../local/project.js'
import { runCommand } from './complete.js'
import { dedent } from './utils.js'

export const REPO = TARGET_REPO.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '')
export const [OWNER, NAME] = REPO.split('/')

export function gitBuildScreenshotsSection(
  screenshots: readonly string[] | null | undefined,
  toUrl: (path: string) => string | null,
): string | null {
  if (!screenshots?.length) return null

  return dedent`
    ## スクリーンショット
    ${screenshots.map((path) => `![${path.split('/').pop()}](${toUrl(path)})`).join('\n')}
  `
}

export function gitPrReviews(prNumber: number): string | null {
  return runCommand([
    `gh api repos/${REPO}/pulls/${prNumber}/reviews --jq '.[] | select(.body != "") | {user: .user.login, state: .state, body: .body}'`,
  ])
}

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

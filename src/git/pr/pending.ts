import { ASSIGNEE, TARGET_REPO, TICKET_PREFIX } from '../../../local/project.js'
import { runCommand } from '../../shared/complete.js'
import { gitPrList } from './list/skill.js'
import { gitPrReviewStatus } from './review/status/skill.js'

export type PendingPr = { number: number; url: string; headRefName: string; issue: number }

export function issueNumberOf(headRefName: string, fallback: number): number {
  const matched = headRefName.match(new RegExp(`${TICKET_PREFIX}-(\\d+)`, 'i'))
  return matched ? Number(matched[1]) : fallback
}

function fetch(search: string): PendingPr[] {
  const raw = runCommand([
    `gh pr list --repo ${TARGET_REPO} ${search} --state open --json number,url,headRefName`,
  ])
  const parsed: { number: number; url: string; headRefName: string }[] = raw ? JSON.parse(raw) : []
  return parsed.map((pr) => ({ ...pr, issue: issueNumberOf(pr.headRefName, pr.number) }))
}

export function myOpenPrs(): PendingPr[] {
  return fetch(`--author ${ASSIGNEE}`)
}

export function prsWithUnresolvedComments(): PendingPr[] {
  return myOpenPrs().filter((pr) => {
    const status = gitPrReviewStatus({ prNumber: pr.number })
    return status.hasComments && !status.allResolved
  })
}

export function prsAwaitingMyReview(): PendingPr[] {
  return fetch(`--search "review-requested:${ASSIGNEE}"`)
}

export function conflictingPrs(): PendingPr[] {
  return gitPrList({ assignee: ASSIGNEE, number: null, state: 'open' })
    .filter((pr) => pr.mergeable === 'CONFLICTING')
    .map((pr) => ({
      number: pr.number,
      url: pr.url,
      headRefName: pr.headRefName,
      issue: issueNumberOf(pr.headRefName, pr.number),
    }))
}

import { PROJECT_ROOT, TICKET_PREFIX } from '../../local/project.js'
import { runCommand } from '../shared/complete.js'
import { WORKTREE_DIR } from '../shared/paths.js'

export function herdrAgentName(issueNumber: number, prefix = 't'): string {
  return `${prefix}${issueNumber}`
}

export function herdrWorktreePath(issueNumber: number): string {
  return `${PROJECT_ROOT}/${WORKTREE_DIR}/${TICKET_PREFIX || 'issue'}-${issueNumber}`
}

export function herdrFindAgent(issueNumber: number): string | null {
  const found = runCommand([
    `herdr agent list 2>/dev/null | jq -r --arg p "${herdrWorktreePath(issueNumber)}" '.result.agents[]? | select(.cwd==$p) | (.name // .pane_id)' || true`,
  ])
  return found?.trim() || null
}

export function herdrSend(agent: string, commands: string[], notes: string[] = []): boolean {
  const message = [...commands, ...notes].filter(Boolean).join('\n')
  const result = runCommand([
    `herdr agent prompt "${agent}" "${message}" >/dev/null 2>&1 && echo sent || echo failed`,
  ])
  return result?.trim() === 'sent'
}

export function herdrRenameAgent(agent: string, newName: string, workspaceName: string): boolean {
  const result = runCommand([
    `WS_ID=$(herdr agent get "${agent}" | jq -r '.result.agent.workspace_id') && herdr workspace rename "$WS_ID" "${workspaceName}" && herdr agent rename "${agent}" "${newName}" && echo renamed || echo failed`,
  ])
  return result?.trim() === 'renamed'
}

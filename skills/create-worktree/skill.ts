import {
  BASE_BRANCH,
  PROJECT_ROOT,
  TICKET_PREFIX,
  VSCODE_WORKSPACE_FILE,
  WORKTREE_SETUP_COMMANDS,
} from '../../local/project.js'
import { getArgs } from '../_shared/args.js'
import { type Schema, readFile, respond, runCommand, writeFile } from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'

const WORKTREE_DIR = '.claude/local/worktrees'

const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    issueNumber: {
      type: 'integer',
      description: 'worktree のキーとなる issue 番号',
    },
    branch: {
      type: ['string', 'null'],
      description: 'チェックアウトする既存ブランチ名。新規 issue 対応でまだ無ければ null',
    },
  },
  required: ['issueNumber', 'branch'],
} as const satisfies Schema

export function createWorktree(args: Infer<typeof ARGS_SCHEMA>): string {
  const { issueNumber, branch } = args
  const worktreePath = `${WORKTREE_DIR}/${TICKET_PREFIX || 'issue'}-${issueNumber}`

  const list = runCommand(['git worktree list --porcelain']) || ''
  const alreadyExists = list.includes(worktreePath)

  if (!alreadyExists) {
    runCommand(
      branch
        ? ['git fetch origin', `git worktree add ${worktreePath} ${branch}`]
        : ['git fetch origin', `git worktree add -d ${worktreePath} origin/${BASE_BRANCH}`],
    )

    runCommand([
      `mkdir -p ${worktreePath}/.claude/local`,
      `cp -r .claude/skills ${worktreePath}/.claude/skills`,
      `cp .claude/CLAUDE.md ${worktreePath}/.claude/CLAUDE.md`,
      `cp .claude/local/project.ts ${worktreePath}/.claude/local/project.ts`,
      `[ -f .claude/local/rules.md ] && cp .claude/local/rules.md ${worktreePath}/.claude/local/rules.md || true`,
      `[ -f .claude/local/guidelines.md ] && cp .claude/local/guidelines.md ${worktreePath}/.claude/local/guidelines.md || true`,
      `[ -f .claude/local/pr-review-patterns.md ] && cp .claude/local/pr-review-patterns.md ${worktreePath}/.claude/local/pr-review-patterns.md || true`,
    ])

    if (WORKTREE_SETUP_COMMANDS.length > 0) {
      runCommand(
        WORKTREE_SETUP_COMMANDS.map((command: string) => `cd ${worktreePath} && ${command}`),
      )
    }

    if (VSCODE_WORKSPACE_FILE) {
      const absoluteWorktreePath = `${PROJECT_ROOT}/${worktreePath}`
      const workspaceContent = readFile(VSCODE_WORKSPACE_FILE)

      if (workspaceContent) {
        const workspace = JSON.parse(workspaceContent)
        const alreadyAdded = workspace.folders.some(
          (folder: { path: string }) => folder.path === absoluteWorktreePath,
        )

        if (!alreadyAdded) {
          workspace.folders.push({
            path: absoluteWorktreePath,
            name: `${TICKET_PREFIX || 'issue'}-${issueNumber}-worktree`,
          })
          writeFile(VSCODE_WORKSPACE_FILE, JSON.stringify(workspace, null, 2))
        }
      }
    }
  }

  return worktreePath
}

respond(createWorktree(getArgs(ARGS_SCHEMA)))

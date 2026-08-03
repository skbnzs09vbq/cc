import {
  BASE_BRANCH,
  MONOREPO_APPS_DIR,
  PROJECT_ROOT,
  TICKET_PREFIX,
  WORKTREE_SETUP_COMMANDS,
} from '../../local/project.js'
import { getArgs } from '../_shared/args.js'
import { type Schema, respond, runCommand } from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'
import { addWorkspaceFolder } from '../_shared/vscode-workspace.js'

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
      description: 'string: チェックアウトする既存ブランチ名, null: 新規 issue 対応でまだ無い場合',
    },
  },
  required: ['issueNumber', 'branch'],
} as const satisfies Schema

export function gitWorktreeCreate(args: Infer<typeof ARGS_SCHEMA>): string {
  const { issueNumber, branch } = args
  const worktreePath = `${PROJECT_ROOT}/${WORKTREE_DIR}/${TICKET_PREFIX || 'issue'}-${issueNumber}`

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
      `cp -r ${PROJECT_ROOT}/.claude/skills ${worktreePath}/.claude/skills`,
      `cp ${PROJECT_ROOT}/.claude/CLAUDE.md ${worktreePath}/.claude/CLAUDE.md`,
      `cp ${PROJECT_ROOT}/.claude/local/project.ts ${worktreePath}/.claude/local/project.ts`,
      `[ -f ${PROJECT_ROOT}/.claude/local/rules.md ] && cp ${PROJECT_ROOT}/.claude/local/rules.md ${worktreePath}/.claude/local/rules.md || true`,
      `[ -f ${PROJECT_ROOT}/.claude/local/guidelines.md ] && cp ${PROJECT_ROOT}/.claude/local/guidelines.md ${worktreePath}/.claude/local/guidelines.md || true`,
      `[ -f ${PROJECT_ROOT}/.claude/local/pr-review-patterns.md ] && cp ${PROJECT_ROOT}/.claude/local/pr-review-patterns.md ${worktreePath}/.claude/local/pr-review-patterns.md || true`,
    ])

    if (MONOREPO_APPS_DIR) {
      runCommand([
        `cd ${PROJECT_ROOT} && git ls-files --others --ignored --exclude-standard -- ${MONOREPO_APPS_DIR} | grep -E '(^|/)\\.env($|\\.)' | while read -r f; do mkdir -p "${worktreePath}/$(dirname "$f")" && cp "${PROJECT_ROOT}/$f" "${worktreePath}/$f"; done`,
      ])
    }

    if (WORKTREE_SETUP_COMMANDS.length > 0) {
      runCommand(
        WORKTREE_SETUP_COMMANDS.map((command: string) => `cd ${worktreePath} && ${command}`),
      )
    }

    addWorkspaceFolder(worktreePath, `${TICKET_PREFIX || 'issue'}-${issueNumber}-worktree`)
  }

  return worktreePath
}

respond(gitWorktreeCreate(getArgs(ARGS_SCHEMA)))

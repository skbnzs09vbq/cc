import { BASE_BRANCH } from '../../local/project.js'
import { getArgs } from '../_shared/args.js'
import { type Schema, respond, runCommand } from '../_shared/complete.js'

const WORKTREE_DIR = '.claude/local/worktrees'

const ARGS_SCHEMA: Schema = {
  type: 'object',
  properties: {
    issueNumber: { type: 'integer', description: 'worktree のキーとなる issue 番号' },
    branch: {
      type: ['string', 'null'],
      description: 'チェックアウトする既存ブランチ名。新規 issue 対応でまだ無ければ null',
    },
  },
  required: ['issueNumber', 'branch'],
}

const { issueNumber, branch } = getArgs<{ issueNumber: number; branch: string | null }>(ARGS_SCHEMA)

const worktreePath = `${WORKTREE_DIR}/issue-${issueNumber}`

const list = runCommand(['git worktree list --porcelain']) || ''
const exists = list.includes(worktreePath)

if (!exists) {
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
}

respond(worktreePath)

import { PROJECT_ROOT, TICKET_PREFIX } from '../../local/project.js'
import { getArgs } from '../_shared/args.js'
import {
  CONFIRM_SCHEMA,
  type Schema,
  askUser,
  exit,
  respond,
  runCommand,
} from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'
import { dedent } from '../_shared/utils.js'
import { removeWorkspaceFolder } from '../_shared/vscode-workspace.js'

const WORKTREE_DIR = '.claude/local/worktrees'

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    issueNumber: { type: 'integer', description: '削除する worktree のキーとなる issue 番号' },
    forceConfirmed: {
      type: ['boolean', 'null'],
      description:
        '通常削除に失敗した場合、強制削除してよいか\n未定なら null（ユーザーに確認する）',
    },
  },
  required: ['issueNumber', 'forceConfirmed'],
} as const satisfies Schema

export function gitWorktreeRemove(args: Infer<typeof ARGS_SCHEMA>): string {
  const { issueNumber } = args
  let { forceConfirmed } = args
  const worktreePath = `${WORKTREE_DIR}/${TICKET_PREFIX || 'issue'}-${issueNumber}`

  // ─── Phase 1: 存在確認 ─────────────────────────────────────
  phase('存在確認')

  const list = runCommand(['git worktree list --porcelain']) || ''
  if (!list.includes(worktreePath)) exit(`${worktreePath} という worktree は見つかりませんでした`)

  // ─── Phase 2: 削除 ─────────────────────────────────────────
  phase('削除')

  runCommand([`git worktree remove ${worktreePath} 2>/dev/null || true`])

  const stillExists = (runCommand(['git worktree list --porcelain']) || '').includes(worktreePath)

  if (stillExists) {
    forceConfirmed ??= askUser(
      dedent`
        ${worktreePath} には未コミットの変更または未追跡ファイルがあり、通常の削除に失敗しました
        強制的に削除してよいですか？（変更内容は失われます）
      `,
      CONFIRM_SCHEMA,
    ).confirmed

    if (!forceConfirmed) exit('削除を中止しました')

    runCommand([`git worktree remove ${worktreePath} --force`])
  }

  // ─── Phase 3: VSCode workspace からの除去 ───────────────────
  phase('VSCode workspaceからの除去')

  removeWorkspaceFolder(`${PROJECT_ROOT}/${worktreePath}`)

  return `${worktreePath} を削除しました（ブランチ自体は削除していません）`
}

respond(gitWorktreeRemove(getArgs(ARGS_SCHEMA)))

import { ARGS_SCHEMA, gitWorktreeRemove } from '@skills/git-worktree-remove/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(gitWorktreeRemove(getArgs(ARGS_SCHEMA)))

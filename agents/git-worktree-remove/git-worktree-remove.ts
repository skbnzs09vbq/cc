import { ARGS_SCHEMA, gitWorktreeRemove } from '@src/git/worktree/remove/skill.js'
import { getArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(gitWorktreeRemove(getArgs(ARGS_SCHEMA)))

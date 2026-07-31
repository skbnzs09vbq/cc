import { ARGS_SCHEMA, gitConflictResolve } from '@skills/git-conflict-resolve/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(gitConflictResolve(getArgs(ARGS_SCHEMA)))

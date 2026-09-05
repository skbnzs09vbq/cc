import { ARGS_SCHEMA, gitConflictResolve } from '@src/git/conflict-resolve/skill.js'
import { getArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(gitConflictResolve(getArgs(ARGS_SCHEMA)))

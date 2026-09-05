import { ARGS_SCHEMA, gitCommit } from '@src/git/commit/skill.js'
import { getArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(gitCommit(getArgs(ARGS_SCHEMA)))

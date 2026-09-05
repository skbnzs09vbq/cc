import { ARGS_SCHEMA, gitBranchName } from '@src/git/branch/name/skill.js'
import { getArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(gitBranchName(getArgs(ARGS_SCHEMA)))

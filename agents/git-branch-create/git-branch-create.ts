import { ARGS_SCHEMA, gitBranchCreate } from '@src/git/branch/create/skill.js'
import { getArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(gitBranchCreate(getArgs(ARGS_SCHEMA)))

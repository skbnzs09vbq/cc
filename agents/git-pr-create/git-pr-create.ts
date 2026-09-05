import { ARGS_SCHEMA, gitPrCreate } from '@src/git/pr/create/skill.js'
import { getArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(gitPrCreate(getArgs(ARGS_SCHEMA)))

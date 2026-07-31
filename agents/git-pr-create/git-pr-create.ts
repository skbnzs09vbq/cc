import { ARGS_SCHEMA, gitPrCreate } from '@skills/git-pr-create/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(gitPrCreate(getArgs(ARGS_SCHEMA)))

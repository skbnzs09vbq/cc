import { ARGS_SCHEMA, gitPrList } from '@skills/git-pr-list/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(gitPrList(getArgs(ARGS_SCHEMA)))

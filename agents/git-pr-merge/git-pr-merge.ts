import { ARGS_SCHEMA, gitPrMerge } from '@skills/git-pr-merge/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(gitPrMerge(getArgs(ARGS_SCHEMA)))

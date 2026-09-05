import { ARGS_SCHEMA, gitPrMerge } from '@src/git/pr/merge/skill.js'
import { getArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(gitPrMerge(getArgs(ARGS_SCHEMA)))

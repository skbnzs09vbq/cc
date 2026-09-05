import { ARGS_SCHEMA, gitPrList } from '@src/git/pr/list/skill.js'
import { getArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(gitPrList(getArgs(ARGS_SCHEMA)))

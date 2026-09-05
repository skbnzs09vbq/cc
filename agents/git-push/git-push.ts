import { ARGS_SCHEMA, gitPush } from '@src/git/push/skill.js'
import { getArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(gitPush(getArgs(ARGS_SCHEMA)))

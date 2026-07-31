import { ARGS_SCHEMA, gitPush } from '@skills/git-push/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(gitPush(getArgs(ARGS_SCHEMA)))

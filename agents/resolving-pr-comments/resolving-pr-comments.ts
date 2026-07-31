import { ARGS_SCHEMA, resolvingPrComments } from '@skills/resolving-pr-comments/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(resolvingPrComments(getArgs(ARGS_SCHEMA)))

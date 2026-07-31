import { ARGS_SCHEMA, gitPrResolveComments } from '@skills/git-pr-resolve-comments/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(gitPrResolveComments(getArgs(ARGS_SCHEMA)))

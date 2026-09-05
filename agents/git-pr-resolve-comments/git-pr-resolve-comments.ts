import { ARGS_SCHEMA, gitPrResolveComments } from '@src/git/pr/resolve-comments/skill.js'
import { getArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(gitPrResolveComments(getArgs(ARGS_SCHEMA)))

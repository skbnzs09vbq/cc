import { ARGS_SCHEMA, gitPrCommentsList } from '@skills/git-pr-comments-list/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(gitPrCommentsList(getArgs(ARGS_SCHEMA)))

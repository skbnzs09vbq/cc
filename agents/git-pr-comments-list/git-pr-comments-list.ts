import { ARGS_SCHEMA, gitPrCommentsList } from '@src/git/pr/comments-list/skill.js'
import { getArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(gitPrCommentsList(getArgs(ARGS_SCHEMA)))

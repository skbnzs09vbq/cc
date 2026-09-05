import { ARGS_SCHEMA, gitPrReviewPost } from '@src/git/pr/review/post/skill.js'
import { getArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(gitPrReviewPost(getArgs(ARGS_SCHEMA)))

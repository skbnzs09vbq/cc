import { ARGS_SCHEMA, gitPrReviewPost } from '@skills/git-pr-review-post/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(gitPrReviewPost(getArgs(ARGS_SCHEMA)))

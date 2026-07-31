import { ARGS_SCHEMA, gitPrReviewStatus } from '@skills/git-pr-review-status/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(gitPrReviewStatus(getArgs(ARGS_SCHEMA)))

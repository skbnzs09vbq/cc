import { ARGS_SCHEMA, gitPrReviewVerify } from '@skills/git-pr-review-verify/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(gitPrReviewVerify(getArgs(ARGS_SCHEMA)))

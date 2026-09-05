import { ARGS_SCHEMA, gitPrReviewVerify } from '@src/git/pr/review/verify/skill.js'
import { getArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(gitPrReviewVerify(getArgs(ARGS_SCHEMA)))

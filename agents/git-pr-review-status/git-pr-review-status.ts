import { ARGS_SCHEMA, gitPrReviewStatus } from '@src/git/pr/review/status/skill.js'
import { getArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(gitPrReviewStatus(getArgs(ARGS_SCHEMA)))

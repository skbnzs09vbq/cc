import { ARGS_SCHEMA, reviewDiff } from '@src/review-diff/skill.js'
import { getArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(reviewDiff(getArgs(ARGS_SCHEMA).workingDir))

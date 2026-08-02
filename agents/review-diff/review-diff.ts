import { ARGS_SCHEMA, reviewDiff } from '@skills/review-diff/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(reviewDiff(getArgs(ARGS_SCHEMA).workingDir))

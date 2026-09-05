import { ARGS_SCHEMA, findSpecGaps } from '@src/find-spec-gaps/skill.js'
import { getArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(findSpecGaps(getArgs(ARGS_SCHEMA)))

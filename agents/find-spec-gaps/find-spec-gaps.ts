import { ARGS_SCHEMA, findSpecGaps } from '@skills/find-spec-gaps/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(findSpecGaps(getArgs(ARGS_SCHEMA)))

import { ARGS_SCHEMA, testE2e } from '@skills/test-e2e/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(testE2e(getArgs(ARGS_SCHEMA)))

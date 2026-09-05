import { ARGS_SCHEMA, testE2e } from '@src/test/e2e/skill.js'
import { getArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(testE2e(getArgs(ARGS_SCHEMA)))

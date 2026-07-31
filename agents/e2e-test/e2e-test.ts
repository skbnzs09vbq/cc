import { ARGS_SCHEMA, e2eTest } from '@skills/e2e-test/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(e2eTest(getArgs(ARGS_SCHEMA)))

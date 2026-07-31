import { ARGS_SCHEMA, testVisualDiff } from '@skills/test-visual-diff/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(testVisualDiff(getArgs(ARGS_SCHEMA)))

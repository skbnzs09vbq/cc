import { ARGS_SCHEMA, testVisualDiff } from '@src/test/visual-diff/skill.js'
import { getArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(testVisualDiff(getArgs(ARGS_SCHEMA)))

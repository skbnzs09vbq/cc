import { ARGS_SCHEMA, syncPrPatterns } from '@src/sync/pr-patterns/skill.js'
import { getArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(syncPrPatterns(getArgs(ARGS_SCHEMA)))

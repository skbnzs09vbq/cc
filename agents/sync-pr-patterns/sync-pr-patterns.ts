import { ARGS_SCHEMA, syncPrPatterns } from '@skills/sync-pr-patterns/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(syncPrPatterns(getArgs(ARGS_SCHEMA)))

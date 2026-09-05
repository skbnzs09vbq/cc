import { ARGS_SCHEMA, dedupItems } from '@src/dedup-items/skill.js'
import { getArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(dedupItems(getArgs(ARGS_SCHEMA)))

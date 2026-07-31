import { ARGS_SCHEMA, dedupItems } from '@skills/dedup-items/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(dedupItems(getArgs(ARGS_SCHEMA)))

import { ARGS_SCHEMA, implement } from '@skills/implement/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(implement(getArgs(ARGS_SCHEMA)))

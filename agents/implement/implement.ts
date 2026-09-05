import { ARGS_SCHEMA, implement } from '@src/implement/skill.js'
import { getArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(implement(getArgs(ARGS_SCHEMA)))

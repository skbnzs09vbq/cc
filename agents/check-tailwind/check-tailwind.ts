import { ARGS_SCHEMA, checkTailwind } from '@src/check-tailwind/skill.js'
import { getArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(checkTailwind(getArgs(ARGS_SCHEMA)))

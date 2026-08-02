import { ARGS_SCHEMA, checkTailwind } from '@skills/check-tailwind/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(checkTailwind(getArgs(ARGS_SCHEMA)))

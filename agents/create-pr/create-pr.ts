import { ARGS_SCHEMA, createPr } from '@skills/create-pr/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(createPr(getArgs(ARGS_SCHEMA)))

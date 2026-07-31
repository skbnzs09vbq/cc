import { ARGS_SCHEMA, createBranch } from '@skills/create-branch/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(createBranch(getArgs(ARGS_SCHEMA)))

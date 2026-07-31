import { ARGS_SCHEMA, createBranchName } from '@skills/create-branch-name/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(createBranchName(getArgs(ARGS_SCHEMA)))

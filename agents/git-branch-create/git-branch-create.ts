import { ARGS_SCHEMA, gitBranchCreate } from '@skills/git-branch-create/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(gitBranchCreate(getArgs(ARGS_SCHEMA)))

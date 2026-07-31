import { ARGS_SCHEMA, gitBranchName } from '@skills/git-branch-name/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(gitBranchName(getArgs(ARGS_SCHEMA)))

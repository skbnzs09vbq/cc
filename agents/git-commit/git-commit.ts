import { ARGS_SCHEMA, gitCommit } from '@skills/git-commit/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(gitCommit(getArgs(ARGS_SCHEMA)))

import { ARGS_SCHEMA, gitPrComment } from '@skills/git-pr-comment/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(gitPrComment(getArgs(ARGS_SCHEMA)))

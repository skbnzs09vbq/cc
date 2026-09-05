import { ARGS_SCHEMA, gitPrComment } from '@src/git/pr/comment/skill.js'
import { getArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(gitPrComment(getArgs(ARGS_SCHEMA)))

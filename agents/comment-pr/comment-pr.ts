import { ARGS_SCHEMA, commentPr } from '@skills/comment-pr/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(commentPr(getArgs(ARGS_SCHEMA)))

import { ARGS_SCHEMA, issueCreate } from '@src/issue/create/skill.js'
import { getArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(issueCreate(getArgs(ARGS_SCHEMA)))

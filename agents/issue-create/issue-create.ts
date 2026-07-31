import { ARGS_SCHEMA, issueCreate } from '@skills/issue-create/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(issueCreate(getArgs(ARGS_SCHEMA)))

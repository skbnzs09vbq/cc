import { ARGS_SCHEMA, issueList } from '@skills/issue-list/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(issueList(getArgs(ARGS_SCHEMA)))

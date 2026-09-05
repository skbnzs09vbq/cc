import { ARGS_SCHEMA, issueList } from '@src/issue/list/skill.js'
import { getArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(issueList(getArgs(ARGS_SCHEMA)))

import { ARGS_SCHEMA, draftIssue } from '@src/issue/draft/skill.js'
import { getArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(draftIssue(getArgs(ARGS_SCHEMA)))

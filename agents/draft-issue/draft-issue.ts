import { ARGS_SCHEMA, draftIssue } from '@skills/draft-issue/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(draftIssue(getArgs(ARGS_SCHEMA)))

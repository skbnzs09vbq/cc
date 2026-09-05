import { ARGS_SCHEMA, planIssue } from '@src/plan-issue/skill.js'
import { getArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(planIssue(getArgs(ARGS_SCHEMA)))

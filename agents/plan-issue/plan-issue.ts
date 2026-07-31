import { ARGS_SCHEMA, planIssue } from '@skills/plan-issue/skill.js'
import { getArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(planIssue(getArgs(ARGS_SCHEMA)))

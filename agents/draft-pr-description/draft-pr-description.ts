import { draftPrDescription } from '@skills/draft-pr-description/skill.js'
import { parseArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(draftPrDescription(parseArgs()))

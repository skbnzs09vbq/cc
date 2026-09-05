import { research } from '@src/research/skill.js'
import { parseArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(research(parseArgs()))

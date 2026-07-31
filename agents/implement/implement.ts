import { implement } from '@skills/implement/skill.js'
import { parseArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(implement(parseArgs()))

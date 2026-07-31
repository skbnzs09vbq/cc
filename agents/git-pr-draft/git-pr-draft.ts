import { gitPrDraft } from '@skills/git-pr-draft/skill.js'
import { parseArgs } from '@skills/_shared/args.js'
import { respond } from '@skills/_shared/complete.js'

respond(gitPrDraft(parseArgs()))

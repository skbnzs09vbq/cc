import { gitPrDraft } from '@src/git/pr/draft/skill.js'
import { parseArgs } from '@src/shared/args.js'
import { respond } from '@src/shared/complete.js'

respond(gitPrDraft(parseArgs()))

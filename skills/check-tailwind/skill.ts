import { BASE_BRANCH } from '../../local/project.js'
import { getArgs } from '../_shared/args.js'
import { type Schema, respond, runCommand } from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'
import { dedent } from '../_shared/utils.js'

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    workingDir: { type: 'string', description: 'チェック対象のディレクトリ' },
  },
  required: ['workingDir'],
} as const satisfies Schema

const SKILL_DIR = '.claude/skills/check-tailwind'

export function checkTailwind(args: Infer<typeof ARGS_SCHEMA>): string {
  const { workingDir } = args

  return (
    runCommand([
      dedent`
        cd ${workingDir}
        mb=$(git merge-base ${BASE_BRANCH} HEAD)
        untracked=$(git ls-files --others --exclude-standard -- '*.ts' '*.tsx')
        if [ -n "$untracked" ]; then
          git add -N -- $untracked
          trap 'git reset -- $untracked >/dev/null 2>&1' EXIT
        fi
        changed=$(git diff --name-only "$mb" -- '*.ts' '*.tsx')
        if [ -z "$changed" ]; then
          echo "Tailwind arbitrary value: 対象ファイルなし ✓"
          exit 0
        fi
        diff_file=$(mktemp)
        git diff --unified=0 "$mb" -- '*.ts' '*.tsx' > "$diff_file"
        ${SKILL_DIR}/node_modules/.bin/eslint \\
          --config ${SKILL_DIR}/eslint.config.js \\
          --no-warn-ignored \\
          --format json \\
          $changed \\
          | node ${SKILL_DIR}/report.mjs "$diff_file"
        rm -f "$diff_file"
      `,
    ]) || 'Tailwind arbitrary value: 指摘なし ✓'
  )
}

respond(checkTailwind(getArgs(ARGS_SCHEMA)))

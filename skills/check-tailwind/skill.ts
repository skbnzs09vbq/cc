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

export function checkTailwind(args: Infer<typeof ARGS_SCHEMA>): string {
  const { workingDir } = args

  return (
    runCommand([
      dedent`
        cd ${workingDir}
        git diff ${BASE_BRANCH}...HEAD -- '*.ts' '*.tsx' | grep '^+' | node -e '
        const px = /\\b(w|h|p[xytrbl]?|m[xytrbl]?|gap(?:-[xy])?|size|top|bottom|left|right|inset(?:-[xy])?|min-[wh]|max-[wh]|space-[xy])-\\[(\\d+)px\\]/g;
        const aspect = /\\baspect-\\[(\\d+)\\/(\\d+)\\]/g;
        let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
          const found = new Map();
          for (const m of s.matchAll(px)) { const v = Number((+m[2] / 4).toFixed(4)); found.set(m[0], \`\${m[1]}-\${v}\`); }
          for (const m of s.matchAll(aspect)) found.set(m[0], \`aspect-\${m[1]}/\${m[2]}\`);
          if (found.size === 0) console.log("Tailwind arbitrary value: 指摘なし ✓");
          else for (const [k, v] of found) console.log(\`\${k} → \${v}\`);
        });'
      `,
    ]) || 'Tailwind arbitrary value: 指摘なし ✓'
  )
}

respond(checkTailwind(getArgs(ARGS_SCHEMA)))

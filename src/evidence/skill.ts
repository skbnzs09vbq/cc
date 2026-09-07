import { PROJECT_ROOT } from '../../local/project.js'
import { getArgs } from '../shared/args.js'
import { type Schema, respond, runCommand } from '../shared/complete.js'
import type { Infer } from '../shared/infer.js'
import { EVIDENCE_DIR, TEST_RUN_DIR } from '../shared/paths.js'
import { dedent } from '../shared/utils.js'

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    issueNumber: { type: 'integer', description: '提出先を決めるための issue 番号' },
    worktreePath: { type: 'string', description: '成果物を持っている worktree のパス' },
  },
  required: ['issueNumber', 'worktreePath'],
} as const satisfies Schema

export const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    collected: { type: 'integer', description: '親へ取り込んだ run の件数' },
    destination: { type: 'string', description: '取り込み先のディレクトリ' },
    runs: { type: 'array', items: { type: 'string' }, description: '取り込んだ run の一覧' },
  },
  required: ['collected', 'destination', 'runs'],
} as const satisfies Schema

export function collectEvidence(args: Infer<typeof ARGS_SCHEMA>): Infer<typeof RESULT_SCHEMA> {
  const { issueNumber, worktreePath } = args
  const source = `${worktreePath}/${TEST_RUN_DIR}`
  const destination = `${PROJECT_ROOT}/${EVIDENCE_DIR}/${issueNumber}`

  // ─── Phase 1: 未取り込みの run を洗い出す ─────────────────
  phase('未取り込みの run を洗い出す')

  const available = (runCommand([`ls -1 ${source} 2>/dev/null || true`]) || '')
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean)

  const already = (runCommand([`ls -1 ${destination} 2>/dev/null || true`]) || '')
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean)

  const runs = available.filter((r) => !already.includes(r))

  if (runs.length === 0) return { collected: 0, destination, runs: [] }

  // ─── Phase 2: 親へ取り込む ─────────────────────────────────
  phase('親へ取り込む')

  runCommand([
    `mkdir -p ${destination}`,
    ...runs.map((r) => `cp -r ${source}/${r} ${destination}/${r}`),
  ])

  const latest = runs[runs.length - 1]

  runCommand([
    dedent`
      cat > ${destination}/latest.md <<'EOF'
      # issue #${issueNumber} の最新検証

      - run: ${latest}
      - 場所: ${EVIDENCE_DIR}/${issueNumber}/${latest}
      EOF
    `,
    `cp ${destination}/${latest}/summary.md ${destination}/latest-summary.md 2>/dev/null || true`,
  ])

  return { collected: runs.length, destination, runs }
}

respond(collectEvidence(getArgs(ARGS_SCHEMA)))

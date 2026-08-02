import { BASE_BRANCH } from '../../local/project.js'
import { getArgs } from '../_shared/args.js'
import { type Schema, complete, respond, runCommand } from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'
import { dedent } from '../_shared/utils.js'

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    workingDir: { type: 'string', description: 'gitリポジトリのディレクトリ' },
    refA: {
      type: ['string', 'null'],
      description: '比較対象1（コミットハッシュ・ブランチ名等）\nnull なら project.ts の BASE_BRANCH',
    },
    refB: { type: 'string', description: '比較対象2（コミットハッシュ・ブランチ名等）' },
    url: {
      type: 'string',
      description:
        '確認するページ\n動的アプリは host:port を除いたパス（例: "/settings"）、静的HTMLはリポジトリルートからの相対ファイルパス',
    },
    serverCommand: {
      type: ['string', 'null'],
      description: '開発サーバー起動コマンド（例: "npm run dev"）\n不要（静的HTML等）なら null',
    },
    port: {
      type: ['integer', 'null'],
      description: 'サーバーのポート番号\nserverCommand がある場合は必須',
    },
    expectDiff: {
      type: 'boolean',
      description: 'refA → refB で見た目の差分が出ることを期待するか',
    },
    expectedArea: {
      type: ['string', 'null'],
      description:
        '差分が出ることを期待する画面上の箇所の説明（例: "右上の通知アイコン周辺"）\nexpectDiff が true の場合のみ使う\nnull なら差分の有無だけ判定し、箇所までは判定しない',
    },
  },
  required: ['workingDir', 'refA', 'refB', 'url', 'serverCommand', 'port', 'expectDiff', 'expectedArea'],
} as const satisfies Schema

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    matchesExpectation: { type: 'boolean', description: '差分の有無・箇所が期待通りだったか' },
    hasDiff: { type: 'boolean', description: '実際に視覚的な差分があったか' },
    findings: {
      type: ['string', 'null'],
      description: '期待と異なる場合の具体的な内容（例: 想定外の箇所に差分がある）\n一致していれば null',
    },
    screenshots: {
      type: 'object',
      properties: {
        before: { type: 'string' },
        after: { type: 'string' },
        diff: { type: 'string' },
        sideBySide: { type: 'string' },
      },
      required: ['before', 'after', 'diff', 'sideBySide'],
    },
  },
  required: ['matchesExpectation', 'hasDiff', 'findings', 'screenshots'],
} as const satisfies Schema

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    matchesExpectation: RESULT_SCHEMA.properties.matchesExpectation,
    hasDiff: RESULT_SCHEMA.properties.hasDiff,
    findings: RESULT_SCHEMA.properties.findings,
  },
  required: ['matchesExpectation', 'hasDiff', 'findings'],
} as const satisfies Schema

const SCRIPTS_DIR = '.claude/skills/test-visual-diff/scripts'

function captureRef(workingDir: string, ref: string, worktreeDir: string, url: string, serverCommand: string | null, port: number | null, outputPath: string) {
  runCommand([`cd ${workingDir} && git fetch origin`, `git worktree add ${worktreeDir} ${ref}`])

  const target = url.startsWith('http') ? url : port ? `http://localhost:${port}${url}` : `file://${worktreeDir}/${url}`

  runCommand(
    serverCommand
      ? [
          `cd ${worktreeDir} && python ${workingDir}/${SCRIPTS_DIR}/with_server.py --server "${serverCommand}" --port ${port} -- python ${workingDir}/${SCRIPTS_DIR}/screenshot.py ${target} ${outputPath}`,
        ]
      : [`python ${workingDir}/${SCRIPTS_DIR}/screenshot.py ${target} ${outputPath}`],
  )

  runCommand([`git -C ${workingDir} worktree remove ${worktreeDir} --force`])
}

export function testVisualDiff(args: Infer<typeof ARGS_SCHEMA>): Infer<typeof RESULT_SCHEMA> {
  const { workingDir, refB, url, serverCommand, port, expectDiff, expectedArea } = args
  const refA = args.refA ?? BASE_BRANCH

  const scratchDir = `${workingDir}/.claude/local/visual-diff`
  const beforePath = `${scratchDir}/before.png`
  const afterPath = `${scratchDir}/after.png`
  const diffPath = `${scratchDir}/diff.png`
  const sideBySidePath = `${scratchDir}/side-by-side.png`

  runCommand([`mkdir -p ${scratchDir}`])

  // ─── Phase 1: refA のスクリーンショット取得 ─────────────────
  phase('refAのスクリーンショット取得')
  captureRef(workingDir, refA, `${scratchDir}/worktree-a`, url, serverCommand, port, beforePath)

  // ─── Phase 2: refB のスクリーンショット取得 ─────────────────
  phase('refBのスクリーンショット取得')
  captureRef(workingDir, refB, `${scratchDir}/worktree-b`, url, serverCommand, port, afterPath)

  // ─── Phase 3: 比較画像生成 ───────────────────────────────────
  phase('比較画像生成')

  runCommand([`pip install --quiet pillow 2>/dev/null || true`])
  const compareOutput = runCommand([
    `python ${workingDir}/${SCRIPTS_DIR}/compare.py ${beforePath} ${afterPath} ${diffPath} ${sideBySidePath}`,
  ])

  // ─── Phase 4: 判定 ───────────────────────────────────────────
  phase('判定')

  const judged = complete(
    dedent`
      ${beforePath}（${refA}時点）・${afterPath}（${refB}時点）・${diffPath}（差分オーバーレイ、赤い箇所が変化点）・
      ${sideBySidePath}（左右比較）の4枚の画像を実際に確認し、差分の有無・箇所を判定してください

      compare.py の出力（機械的な差分検出結果の参考値）:
      ${compareOutput || '(出力なし)'}

      期待:
      - 差分が出ることを${expectDiff ? '期待する' : '期待しない（出てはいけない）'}
      ${expectDiff && expectedArea ? `- 差分が出るべき箇所: ${expectedArea}（それ以外の箇所に差分があれば想定外＝デグレの疑い）` : ''}
    `,
    JUDGE_SCHEMA,
  )

  return {
    matchesExpectation: judged.matchesExpectation,
    hasDiff: judged.hasDiff,
    findings: judged.findings,
    screenshots: { before: beforePath, after: afterPath, diff: diffPath, sideBySide: sideBySidePath },
  }
}

respond(testVisualDiff(getArgs(ARGS_SCHEMA)))

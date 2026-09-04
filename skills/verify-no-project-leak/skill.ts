import { type Schema, complete, respond, runCommand, writeFile } from '../_shared/complete.js'
import { LOCAL_DIR, PROJECT_TS_PATH, VERIFY_STATE_PATH } from '../_shared/paths.js'
import { dedent } from '../_shared/utils.js'

const TARGET_PATHS = ['project.example.ts', 'CLAUDE.md', 'agents', 'skills']

const SECRET_PATTERNS = [
  'ghp_|github_pat_|xox[baprs]-|sk-[A-Za-z0-9]{16,}',
  'Bearer [A-Za-z0-9._-]{20,}',
  '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
  'github\\.com/[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+',
  '(app\\.notion\\.com|notion\\.so)/[a-z0-9]',
  'slack\\.com/archives',
]

const ALLOWED = ['<org>/<repo>', '<workspace>', 'anthropics/', 'noreply@anthropic', 'example.com']

const SELF_PATH = 'skills/verify-no-project-leak/skill.ts'

const CHECK_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          reason: { type: 'string', description: 'なぜ project 固有の実値・秘密情報だと判断したか' },
        },
        required: ['file', 'reason'],
      },
      description: '実際に project 固有の実値・秘密情報だと判断したものだけ（誤検知は除く）',
    },
  },
  required: ['findings'],
} as const satisfies Schema

export function verifyNoProjectLeak(): string {
  const LS_FILES = `git ls-files --cached --others --exclude-standard ${TARGET_PATHS.join(' ')}`

  // ─── Phase 1: 対象ファイルの特定 ───────────────────────────────
  phase('対象ファイルの特定')

  const checksum = runCommand([
    `cd .claude && ${LS_FILES} -z | sort -z | xargs -0 cat | sha256sum | awk '{print $1}'`,
  ])?.trim()

  const verified = runCommand([`cat ${VERIFY_STATE_PATH} 2>/dev/null || echo ""`])
  if (verified && checksum && verified.includes(checksum))
    return '前回の検証時から対象ファイルに変更はありません\nコミットして問題ありません'

  // ─── Phase 2: 実値との照合 ─────────────────────────────────────
  phase('実値との照合')

  const realValueHits = runCommand([
    dedent`
      cd .claude
      grep -oE "= *'[^']+'" ${PROJECT_TS_PATH} 2>/dev/null | sed "s/.*= *'//; s/'$//" |
        grep -vE '^(main|master|github|notion|linear|backlog|en|ja|issue|npm run dev)$' | sort -u |
        while read -r value; do
          [ -z "$value" ] && continue
          ${LS_FILES} | xargs grep -Fln -- "$value" 2>/dev/null |
            while read -r f; do echo "[実値: $value] $f"; done
        done
    `,
  ])

  // ─── Phase 3: 秘密情報・外部URLの走査 ─────────────────────────
  phase('秘密情報・外部URLの走査')

  const patternHits = runCommand([
    dedent`
      cd .claude
      ${LS_FILES} | grep -v '^${SELF_PATH}$' | xargs grep -nE "${SECRET_PATTERNS.join('|')}" 2>/dev/null |
        grep -vE "${ALLOWED.join('|')}" || true
    `,
  ])

  // ─── Phase 4: 候補の判定 ───────────────────────────────────────
  phase('候補の判定')

  const candidates = [realValueHits, patternHits].filter(Boolean).join('\n')

  const findings = candidates
    ? complete(
        dedent`
          以下は project.example.ts・CLAUDE.md・agents/・skills/ 配下の走査で引っかかった箇所です
          これらは本来「どのプロジェクトでも使い回せる汎用テンプレート」であるべきファイルです
          （project 固有の実値は ${LOCAL_DIR}/ 配下にのみ置く規約になっています）

          実際に該当箇所を読んだうえで、次のどちらかに当たるものだけを findings に入れてください

          - 特定プロジェクトの実際の値（実在するリポジトリURL・アカウント名・チケット接頭辞等）
          - APIキー・トークン・パスワード等の秘密情報

          プレースホルダ・一般的な例示・説明文中の一般名詞は誤検知として除いてください

          走査結果:
          ${candidates}
        `,
        CHECK_SCHEMA,
      ).findings
    : []

  // ─── Phase 5: 結果の反映 ───────────────────────────────────────
  phase('結果の反映')

  if (findings.length > 0)
    return dedent`
      以下の箇所に project 固有の実値・秘密情報の疑いがあります
      修正してから再度このスキルを実行してください（検証済みになるまでコミットはブロックされます）

      ${findings.map((f) => `- ${f.file}: ${f.reason}`).join('\n')}
    `

  writeFile(
    VERIFY_STATE_PATH,
    JSON.stringify({ verifiedChecksum: checksum, verifiedAt: new Date().toISOString() }, null, 2),
  )

  return dedent`
    project固有の情報は見つかりませんでした
    検証済みとして記録しました
    コミットして問題ありません
  `
}

respond(verifyNoProjectLeak())

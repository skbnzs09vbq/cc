import { type Schema, complete, respond, runCommand, writeFile } from '../_shared/complete.js'
import { dedent } from '../_shared/utils.js'

const STATE_PATH = '.claude/local/verify-state.json'
const TARGET_PATHS = ['project.example.ts', 'CLAUDE.md', 'agents', 'skills']

const CHECK_SCHEMA = {
  type: 'object',
  properties: {
    clean: { type: 'boolean' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['file', 'reason'],
      },
      description: 'project固有の実値・秘密情報らしき箇所（無ければ空配列）',
    },
  },
  required: ['clean', 'findings'],
} as const satisfies Schema

export function verifyNoProjectLeak(): string {
  // ─── Phase 1: 対象ファイルの読み込み ───────────────────────────
  phase('対象ファイルの読み込み')

  const LS_FILES = `git ls-files -z --cached --others --exclude-standard ${TARGET_PATHS.join(' ')}`

  const checksum = runCommand([
    `cd .claude && ${LS_FILES} | sort -z | xargs -0 cat | sha256sum | awk '{print $1}'`,
  ])?.trim()

  const contents = runCommand([
    `cd .claude && ${LS_FILES} | sort -z | xargs -0 -I{} sh -c 'echo "=== {} ==="; cat "{}"'`,
  ])

  // ─── Phase 2: project固有の実値・秘密情報の確認 ─────────────────
  phase('内容確認')

  const result = complete(
    dedent`
      以下は project.example.ts・CLAUDE.md・agents/・skills/ 配下の全ファイル内容です
      これらは本来「どのプロジェクトでも使い回せる汎用テンプレート」であるべきファイルです
      （project 固有の実値は .claude/local/ 配下にのみ置く規約になっています）

      次のようなものが紛れ込んでいないか確認してください:
      - 特定プロジェクトの実際の値（実在するリポジトリURL・アカウント名・チケット接頭辞等
        "<org>/<repo>" のようなプレースホルダは問題なし）
      - APIキー・トークン・パスワード等の秘密情報

      ${contents}
    `,
    CHECK_SCHEMA,
  )

  // ─── Phase 3: 結果の反映 ─────────────────────────────────────
  phase('結果の反映')

  if (result.clean) {
    writeFile(
      STATE_PATH,
      JSON.stringify({ verifiedChecksum: checksum, verifiedAt: new Date().toISOString() }, null, 2),
    )
    return 'project固有の情報は見つかりませんでした\n検証済みとして記録しました\nコミットして問題ありません'
  }

  return dedent`
    以下の箇所に project 固有の実値・秘密情報の疑いがあります
    修正してから再度このスキルを実行してください（検証済みになるまでコミットはブロックされます）

    ${result.findings.map((f) => `- ${f.file}: ${f.reason}`).join('\n')}
  `
}

respond(verifyNoProjectLeak())

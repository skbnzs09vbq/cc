import { dedent } from '../_shared/utils.js'
import { complete, remember, readFile, writeFile, respond, exit } from '../_shared/complete.js'
import { parseArgs } from '../_shared/args.js'

const COMMANDS_PATH = '.claude/local/commands.md'
const input = parseArgs()

if (input) {
  // ─── Phase 1: 重複確認 ─────────────────────────────────────
  phase('重複確認')

  const existing = readFile(COMMANDS_PATH)

  const alreadyExists = complete(
    dedent`
      以下の既存内容に、次のコマンドと同じ内容がすでに含まれているか判定してください。

      既存内容:
      ${existing || '(なし)'}

      コマンド:
      ${input}
    `,
    { type: 'boolean' }
  )

  if (alreadyExists) {
    exit()
  }

  // ─── Phase 2: commands.md への追記 ────────────────────────────
  phase('commands.md への追記')

  const updated = complete(
    dedent`
      既存の commands.md に、以下のコマンドを違和感なく追記してください。

      既存内容:
      ${existing || '(なし。新規作成する)'}

      追記するコマンド:
      ${input}
    `
  )

  writeFile(COMMANDS_PATH, updated)

  respond(dedent`
    ${COMMANDS_PATH} に追記しました。

    ${input}
  `)
} else {
  remember(['commands.md の内容をそのまま出力すること。要約・説明・補足を一切加えない'])

  // ─── Phase 1: commands.md の読み込み ─────────────────────────
  phase('commands.md の読み込み')

  const commandsContent = readFile(COMMANDS_PATH)

  // ─── Phase 2: 出力 ────────────────────────────────────────────
  phase('出力')

  if (commandsContent === null) {
    exit(`${COMMANDS_PATH} が見つかりませんでした。`)
  }

  respond(commandsContent)
}

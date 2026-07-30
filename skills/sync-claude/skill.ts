import { getArgs } from '../_shared/args.js'
import { type Schema, askUser, exit, generate, respond, runCommand } from '../_shared/complete.js'
import { dedent } from '../_shared/utils.js'

const ARGS_SCHEMA: Schema = {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: '比較対象 project のフォルダパス（この直下の .claude と比較する。WSL・Windowsどちらの表記でもよい）',
    },
  },
  required: ['path'],
}

const { path } = getArgs<{ path: string }>(ARGS_SCHEMA)

// ─── Phase 1: パスの正規化 ─────────────────────────────────
phase('パスの正規化')

const remoteClaudePath = generate(dedent`
  次のパス配下の .claude ディレクトリに、現在のシェル環境から実際にアクセスできる絶対パスを確定してください。

  - 今の環境が WSL か Windows(git-bash) かを uname -r 等で確認する
  - 与えられたパスの表記を、今の環境で使える形式に変換した候補をいくつか作る
    （例: Windowsパス ⇔ WSL UNC "\\\\wsl.localhost\\<distro>\\..." ⇔ WSLネイティブ "/home/..." ⇔ "/mnt/<drive>/..."）
  - 各候補を実際に test -d で確認し、実在するものを採用する
  - 複数見つかる、またはどれも見つからない場合はユーザーに確認する

  与えられたパス: ${path}

  確定した「.claude ディレクトリの絶対パス」だけを1行で返してください（説明文は不要）
`).trim()

const remoteExists = runCommand([`test -d "${remoteClaudePath}" && echo yes || echo no`])?.trim()
if (remoteExists !== 'yes') {
  exit(`${remoteClaudePath} が見つかりません`)
}

const remoteIsGit = runCommand([`test -d "${remoteClaudePath}/.git" && echo yes || echo no`])?.trim() === 'yes'

// ─── Phase 2: 差分検出 ─────────────────────────────────────
phase('差分検出')

const remoteFiles = (
  runCommand([
    remoteIsGit
      ? `cd "${remoteClaudePath}" && git ls-files | sort`
      : `cd "${remoteClaudePath}" && find . -type f -not -path './local/*' -not -path './.git/*' | sed 's|^\\./||' | sort`,
  ]) || ''
)
  .split('\n')
  .filter(Boolean)
const localFiles = (runCommand(['cd .claude && git ls-files | sort']) || '')
  .split('\n')
  .filter(Boolean)

const added = remoteFiles.filter((f) => !localFiles.includes(f))
const removed = localFiles.filter((f) => !remoteFiles.includes(f))
const common = remoteFiles.filter((f) => localFiles.includes(f))

const modified = common.filter(
  (f) =>
    runCommand([`diff -q "${remoteClaudePath}/${f}" ".claude/${f}" >/dev/null 2>&1 || echo diff`])?.trim() ===
    'diff',
)

if (added.length === 0 && removed.length === 0 && modified.length === 0) {
  exit('差分はありませんでした')
}

const diffDetail = modified
  .map((f) => runCommand([`diff -u ".claude/${f}" "${remoteClaudePath}/${f}"`]) || '')
  .join('\n\n')

// ─── Phase 3: 確認 ─────────────────────────────────────────
phase('確認')

const { confirmed } = askUser<{ confirmed: boolean }>(
  dedent`
    ${remoteClaudePath} との差分（local/ を除くファイルのみ）:

    追加される（今には無い）ファイル:
    ${added.join('\n') || '(なし)'}

    削除される（今にしか無い）ファイル:
    ${removed.join('\n') || '(なし)'}

    変更されるファイル:
    ${modified.join('\n') || '(なし)'}

    詳細diff（変更ファイル分）:
    ${diffDetail || '(なし)'}

    ${remoteClaudePath} 側の内容を正として、今の .claude に取り込んでよいですか？
  `,
  { type: 'object', properties: { confirmed: { type: 'boolean' } }, required: ['confirmed'] },
)

if (!confirmed) exit('取り込みを中止しました')

// ─── Phase 4: 取り込み ─────────────────────────────────────
phase('取り込み')

runCommand([
  dedent`
    cd "${remoteClaudePath}" && printf '%s\\n' ${remoteFiles.map((f) => `"${f}"`).join(' ')} | while IFS= read -r f; do
      mkdir -p "$OLDPWD/.claude/$(dirname "$f")"
      cp "$f" "$OLDPWD/.claude/$f"
    done
  `,
])

for (const f of removed) {
  runCommand([`rm -f ".claude/${f}"`])
}

respond(dedent`
  ${remoteClaudePath} の内容を今の .claude に取り込みました（追加${added.length}件・削除${removed.length}件・変更${modified.length}件）。
  git status で反映内容を確認し、問題なければ verify-no-project-leak を実行してからコミットしてください。
`)

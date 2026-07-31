import { getArgs } from '../_shared/args.js'
import {
  type Schema,
  askUser,
  exit,
  generate,
  readFile,
  respond,
  runCommand,
  writeFile,
} from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'
import { dedent } from '../_shared/utils.js'

const TEMPLATE_PATH = '.claude/project.example.ts'
const OUTPUT_PATH = '.claude/local/project.ts'

const AUTO_DEV_TEMPLATE_PATH = '.claude/rules.auto-dev.example.md'
const RULES_PATH = '.claude/local/rules.md'

const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    mode: {
      type: 'string',
      enum: ['add', 'update'],
      description: '先頭トークンが "update" なら update、それ以外は add',
    },
    names: {
      type: 'array',
      items: { type: 'string' },
      description:
        '対象の定数名一覧。update の場合は先頭の "update" を除いた残りのトークン、add の場合は全トークン',
    },
    addClaude: {
      type: ['boolean', 'null'],
      description: '.gitignore に .claude を追加してよいか。未定なら null（ユーザーに確認する）',
    },
    gitignoreCommitConfirmed: {
      type: ['boolean', 'null'],
      description: '.gitignore をコミットしてよいか。未定なら null（ユーザーに確認する）',
    },
    gitignorePushConfirmed: {
      type: ['boolean', 'null'],
      description: '.gitignore のコミットを push してよいか。未定なら null（ユーザーに確認する）',
    },
    gitPolicy: {
      type: ['string', 'null'],
      enum: ['no-git', 'no-commit', 'normal', null],
      description: '.claude 自身の git 管理方針。未定なら null（ユーザーに確認する）',
    },
    initialCommitConfirmed: {
      type: ['boolean', 'null'],
      description: '空の初回コミットを作成してよいか。未定なら null（ユーザーに確認する）',
    },
    initialCommitPushConfirmed: {
      type: ['boolean', 'null'],
      description: '初回コミットを push してよいか。未定なら null（ユーザーに確認する）',
    },
  },
  required: [
    'mode',
    'names',
    'addClaude',
    'gitignoreCommitConfirmed',
    'gitignorePushConfirmed',
    'gitPolicy',
    'initialCommitConfirmed',
    'initialCommitPushConfirmed',
  ],
} as const satisfies Schema

const VALUES_SCHEMA: Schema = {
  type: 'object',
  description:
    '対象定数名をキー、確定値を値としたオブジェクト。確認・変更が不要な定数はキーごと含めない',
}

export function setup(args: Infer<typeof ARGS_SCHEMA>): void {
  const { mode, names } = args
  let {
    addClaude,
    gitignoreCommitConfirmed,
    gitignorePushConfirmed,
    gitPolicy,
    initialCommitConfirmed,
    initialCommitPushConfirmed,
  } = args

  const output = readFile(OUTPUT_PATH)
  const isInitialSetup = !output

  // ─── Phase 1: 定数の値を確認 ─────────────────────────────────
  phase('定数の値を確認')

  const template = readFile(TEMPLATE_PATH)

  const finalValues = askUser(
    dedent`
      以下のテンプレートと現在の設定をもとに、対象の定数の値を確認してください。

      対象: ${names.length ? names.join(', ') : mode === 'add' ? '全定数のうち未設定のもの' : '全定数'}

      - ${mode === 'add' ? '既に値が設定されている定数は対象から除外する' : '指定された定数はすべて対象にする（既存値があっても変更するか確認する）'}
      - git remote / gh コマンド等で自動検出できる値があれば検出し、「この値でよいか」を確認する
      - 現在値があれば「現在値 → 変更するか」を確認する
      - テンプレートに既定値があればそれを提示し、変更したい場合のみ新しい値を聞く
      - いずれもなければ値を質問する（不明・未使用なら空欄でよい旨を伝える）
      - 確認・質問は長文の一括箇条書きではなく、選択式 UI（1問につき2〜4択、1回につき最大4問）のダイアログで行う。
        enum・boolean・既知候補（現在値／自動検出値／テンプレート既定値／変更する 等）がある定数は選択肢として提示する。
        URL・パスなど自由記述が必要な定数のみ、選択肢の中に「自由入力」を含めるか個別にテキストで質問する
      - 対象定数が5件を超える場合は、関連する定数ごとにまとめて複数回に分けて聞く（1回に詰め込みすぎない）

      テンプレート:
      ${template}

      現在の設定（無ければ未設定として扱う）:
      ${output || '(なし)'}
    `,
    VALUES_SCHEMA,
  ) as Record<string, string>

  if (Object.keys(finalValues).length === 0 && !isInitialSetup) exit('対象の定数は設定済みです')

  // ─── Phase 2: OUTPUT の作成・更新 ────────────────────────────
  phase('OUTPUT の作成・更新')

  const newContent =
    Object.keys(finalValues).length === 0
      ? (output as string)
      : generate(
          output
            ? dedent`
              以下の既存内容のうち、次の値に該当する定数の宣言だけを更新してください（他の宣言はそのまま保持する）。

              既存内容:
              ${output}

              更新する値:
              ${JSON.stringify(finalValues)}
            `
            : dedent`
              以下のテンプレートと同じ構造（export const 宣言・JSDoc コメント・区切りコメント）で、
              次の値に該当する定数だけ値を置き換えて新規作成してください（それ以外はテンプレートの既定値のまま残す）。

              テンプレート:
              ${template}

              更新する値:
              ${JSON.stringify(finalValues)}
            `,
        )

  writeFile(OUTPUT_PATH, newContent)

  respond(`${OUTPUT_PATH} を更新しました（対象: ${Object.keys(finalValues).join(', ') || 'なし'}）`)

  // ─── Phase 3: auto-dev の有効化 ─────────────────────────────
  phase('auto-dev の有効化')

  if (isInitialSetup && /USE_AUTO_DEV\s*=\s*true/.test(newContent)) {
    const rulesContent = readFile(RULES_PATH)
    const autoDevTemplate = readFile(AUTO_DEV_TEMPLATE_PATH)
    const merged = rulesContent
      ? generate(dedent`
          以下の既存内容に、次のテンプレート内容を追記してください。
          既存内容に同じ見出し（例: "## GitHub 操作"）が既にあれば、新規見出しを作らずそのセクション内に自然に統合する。

          既存内容:
          ${rulesContent}

          追記するテンプレート:
          ${autoDevTemplate}
        `)
      : (autoDevTemplate as string)
    writeFile(RULES_PATH, merged)
    respond(`${RULES_PATH} に auto-dev 用ルールを追加しました`)
  }

  // ─── Phase 4: .gitignore の確認 ─────────────────────────────
  phase('.gitignoreの確認')

  if (/USE_AUTO_DEV\s*=\s*true/.test(newContent)) {
    const GITIGNORE_PATH = '.gitignore'
    const gitignoreContent = readFile(GITIGNORE_PATH)
    const hasClaudeEntry = (gitignoreContent || '')
      .split('\n')
      .some((line) => line.trim() === '.claude' || line.trim() === '.claude/')

    let addedClaudeEntry = hasClaudeEntry

    if (!hasClaudeEntry) {
      addClaude ??= askUser(
        dedent`
          ${GITIGNORE_PATH} に .claudeが含まれていません
          追加しますか？
          追加しない場合は .claude をそのまま通常の git 管理下に置きます
        `,
        {
          type: 'object',
          properties: { addClaude: { type: 'boolean' } },
          required: ['addClaude'],
        } as const,
      ).addClaude

      if (addClaude) {
        writeFile(
          GITIGNORE_PATH,
          gitignoreContent ? `${gitignoreContent.trimEnd()}\n.claude\n` : '.claude\n',
        )
        respond(`${GITIGNORE_PATH} に .claude を追加しました`)
        addedClaudeEntry = true
      } else {
        respond('.claude は git 管理下のままにします')
      }
    }

    const gitignoreTracked =
      addedClaudeEntry &&
      runCommand([
        `git ls-files --error-unmatch ${GITIGNORE_PATH} >/dev/null 2>&1 && echo tracked`,
      ])?.trim() === 'tracked'

    if (addedClaudeEntry && !gitignoreTracked) {
      gitignoreCommitConfirmed ??= askUser(
        dedent`
          ${GITIGNORE_PATH}（.claude を除外する設定）がまだコミットされていません
          このままだと git-worktree-create が作る worktree はコミット済みの内容からチェックアウトされるため、
          .claude が ignore されなくなり、誤って .claude ごとコミットされてしまいます

          ${GITIGNORE_PATH} をコミットしてよいですか？
        `,
        {
          type: 'object',
          properties: { confirmed: { type: 'boolean' } },
          required: ['confirmed'],
        } as const,
      ).confirmed

      if (gitignoreCommitConfirmed) {
        runCommand([`git add ${GITIGNORE_PATH}`, 'git commit -m "chore: ignore .claude"'])
        respond(`${GITIGNORE_PATH} をコミットしました`)

        const hasUpstream = runCommand([
          'git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null',
        ])
        if (!hasUpstream) {
          const baseBranch = newContent.match(/BASE_BRANCH\s*=\s*['"]([^'"]+)['"]/)?.[1] || 'main'
          gitignorePushConfirmed ??= askUser(
            `この内容を origin/${baseBranch}（project.ts の BASE_BRANCH）に push してよいですか？（worktree 作成には push 済みの状態が必要です）`,
            {
              type: 'object',
              properties: { confirmedPush: { type: 'boolean' } },
              required: ['confirmedPush'],
            } as const,
          ).confirmedPush

          if (gitignorePushConfirmed) {
            runCommand([`git push -u origin HEAD:${baseBranch}`])
            respond('push しました')
          } else {
            respond('push は行いませんでした')
          }
        }
      } else {
        respond(
          `${GITIGNORE_PATH} のコミットは行いませんでした。コミットするまで .claude が worktree で ignore されない点に注意してください`,
        )
      }
    }
  }

  // ─── Phase 5: .claude のgit管理方針 ───────────────────────────
  phase('.claudeのgit管理方針')

  const CLAUDE_IS_GIT =
    runCommand(['test -d .claude/.git && echo yes || echo no'])?.trim() === 'yes'
  const GIT_POLICY_PATH = '.claude/local/git-policy.json'

  if (CLAUDE_IS_GIT) {
    const currentPolicyRaw = readFile(GIT_POLICY_PATH)
    const currentPolicy = currentPolicyRaw ? JSON.parse(currentPolicyRaw).mode : 'normal'

    gitPolicy ??= askUser(
      dedent`
        .claude 自身の git 管理方針を選んでください（現在: ${currentPolicy}）

        1. no-git: .claude 内の .git を削除する（更新履歴を持たず、sync-claude スキルで他環境から取り込む運用向け）
        2. no-commit: .git は残すが commit・push を禁止する（履歴の参照・pull はできるが書き込みは不可）
        3. normal: 通常通り commit・push できる（デフォルト）
      `,
      {
        type: 'object',
        properties: { gitPolicy: { type: 'string', enum: ['no-git', 'no-commit', 'normal'] } },
        required: ['gitPolicy'],
      } as const,
    ).gitPolicy

    if (gitPolicy === 'no-git') {
      runCommand(['rm -rf .claude/.git'])
      respond('.claude/.git を削除しました（以後 .claude は通常のフォルダとして扱われます）')
    } else {
      writeFile(GIT_POLICY_PATH, JSON.stringify({ mode: gitPolicy }, null, 2))
      runCommand(['git -C .claude config core.hooksPath hooks'])
      respond(
        gitPolicy === 'no-commit'
          ? '.claude では commit・push がブロックされるようになりました'
          : '.claude は通常通り commit・push できます',
      )
    }
  }

  // ─── Phase 6: VS Codeフォーマッタ設定 ───────────────────────
  phase('VS Codeフォーマッタ設定')

  const hasBiomeConfig =
    runCommand(['test -f .claude/biome.json && echo yes || echo no'])?.trim() === 'yes'

  if (hasBiomeConfig) {
    const VSCODE_SETTINGS_PATH = '.claude/.vscode/settings.json'
    const existingSettingsRaw = readFile(VSCODE_SETTINGS_PATH)
    const hasBiomeFormatter = existingSettingsRaw?.includes('biomejs.biome') ?? false

    if (!hasBiomeFormatter) {
      const settings = existingSettingsRaw ? JSON.parse(existingSettingsRaw) : {}
      settings['editor.defaultFormatter'] = 'biomejs.biome'
      settings['editor.formatOnSave'] = true
      settings['editor.codeActionsOnSave'] = {
        ...(settings['editor.codeActionsOnSave'] || {}),
        'quickfix.biome': 'explicit',
        'source.organizeImports.biome': 'explicit',
      }
      settings['[javascript]'] = { 'editor.defaultFormatter': 'biomejs.biome' }
      settings['[typescript]'] = { 'editor.defaultFormatter': 'biomejs.biome' }
      settings['[json]'] = { 'editor.defaultFormatter': 'biomejs.biome' }
      settings['[jsonc]'] = { 'editor.defaultFormatter': 'biomejs.biome' }
      settings['prettier.enable'] = false
      writeFile(VSCODE_SETTINGS_PATH, JSON.stringify(settings, null, 2))
      respond(`${VSCODE_SETTINGS_PATH} に Biome をデフォルトフォーマッタとして設定しました`)
    }

    const EXTENSIONS_PATH = '.claude/.vscode/extensions.json'
    if (!readFile(EXTENSIONS_PATH)) {
      writeFile(
        EXTENSIONS_PATH,
        JSON.stringify(
          {
            recommendations: ['biomejs.biome'],
            unwantedRecommendations: ['esbenp.prettier-vscode'],
          },
          null,
          2,
        ),
      )
      respond(`${EXTENSIONS_PATH} を作成しました`)
    }
  }

  // ─── Phase 7: 初回コミット確認 ───────────────────────────────
  phase('初回コミット確認')

  if (isInitialSetup && /USE_AUTO_DEV\s*=\s*true/.test(newContent)) {
    const baseBranch = newContent.match(/BASE_BRANCH\s*=\s*['"]([^'"]+)['"]/)?.[1] || 'main'
    const hasCommits = runCommand(['git rev-parse --verify HEAD'])

    if (!hasCommits) {
      initialCommitConfirmed ??= askUser(
        'このリポジトリにはまだコミットが1つもありません。auto-dev の worktree 作成には最低1つのコミットが必要です。空の初回コミット（chore: initial empty commit）を作成してよいですか？',
        {
          type: 'object',
          properties: { confirmed: { type: 'boolean' } },
          required: ['confirmed'],
        } as const,
      ).confirmed

      if (initialCommitConfirmed) {
        runCommand(['git commit --allow-empty -m "chore: initial empty commit"'])
        respond('空の初回コミットを作成しました')

        initialCommitPushConfirmed ??= askUser(
          `この初回コミットを origin/${baseBranch}（project.ts の BASE_BRANCH）に push してよいですか？（worktree 作成には push 済みの状態が必要です）`,
          {
            type: 'object',
            properties: { confirmedPush: { type: 'boolean' } },
            required: ['confirmedPush'],
          } as const,
        ).confirmedPush

        if (initialCommitPushConfirmed) {
          runCommand([`git push -u origin HEAD:${baseBranch}`])
          respond('push しました')
        } else {
          respond('push は行いませんでした。push するまで auto-dev の worktree 作成は失敗します')
        }
      }
    }
  }

  // ─── Phase 8: 案内 ─────────────────────────────────────────
  phase('案内')

  if (/USE_AUTO_DEV\s*=\s*true/.test(newContent))
    respond('`/auto-dev` を実行して workflow を起動することができます')
}

setup(getArgs(ARGS_SCHEMA))

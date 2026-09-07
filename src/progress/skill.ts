import { getArgs } from '../shared/args.js'
import { type Schema, readFile, respond, runCommand, writeFile } from '../shared/complete.js'
import type { Infer } from '../shared/infer.js'
import { PROGRESS_PATH } from '../shared/paths.js'
import { dedent } from '../shared/utils.js'

export const STATUSES = [
  'idle',
  'planning',
  'implementing',
  'verifying',
  'fixing',
  'done',
  'talking',
  'blocked',
] as const

export type Status = (typeof STATUSES)[number]

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    workingDir: {
      type: ['string', 'null'],
      description: 'string: 対象の worktree, null: 未指定（カレントディレクトリ）',
    },
    status: {
      type: ['string', 'null'],
      enum: [...STATUSES, null],
      description: dedent`
        string: 更新後のステータス
        idle: 指示待ち, planning: 計画中, implementing: 実装中, verifying: テスト実行中,
        fixing: 自分の PR に来た指摘の対応中, done: テストまで完了, talking: user と直接会話中,
        blocked: 何ひとつ進められない場合のみ（環境不備・権限など。仕様未確定は blocked にしない）
        null: 変更せず現状を表示するだけ
      `,
    },
    task: {
      type: ['string', 'null'],
      description: 'string: この worktree が対応するタスクの URL, null: 変更しない',
    },
    now: { type: ['string', 'null'], description: 'string: いま何をしているか1〜2文, null: 変更しない' },
    done: {
      type: ['array', 'null'],
      items: { type: 'string' },
      description: 'array: 今回完了した内容（既存に追記される）, null: なし',
    },
    next: {
      type: ['array', 'null'],
      items: { type: 'string' },
      description: 'array: 次にやること（置き換え）, null: 変更しない',
    },
    questions: {
      type: ['array', 'null'],
      items: { type: 'string' },
      description:
        'array: 仕様が決めきれず TODO/スタブで進めた箇所の確認事項（既存に追記される）, null: なし',
    },
    resolved: {
      type: ['array', 'null'],
      items: { type: 'string' },
      description: 'array: 回答を得て解消した確認事項（前方一致で取り除く）, null: なし',
    },
    pending: {
      type: ['integer', 'null'],
      description: 'integer: 未確定仕様のため保留になっているテストシナリオ件数, null: 変更しない',
    },
  },
  required: [
    'workingDir',
    'status',
    'task',
    'now',
    'done',
    'next',
    'questions',
    'resolved',
    'pending',
  ],
} as const satisfies Schema

export type Progress = {
  status: Status
  issue: string | null
  task: string | null
  branch: string | null
  updated: string | null
  pending: number
  questions: string[]
  now: string
  done: string[]
  next: string[]
}

const SECTION = { now: 'Now', done: 'Done', next: 'Next', questions: 'Questions' }

export function parseProgress(markdown: string | null): Progress | null {
  if (!markdown) return null

  const front = markdown.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ''
  const value = (key: string) => front.match(new RegExp(`^${key}: (.*)$`, 'm'))?.[1]?.trim() || null
  const list = (heading: string) =>
    (markdown.match(new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`))?.[1] ?? '')
      .split('\n')
      .map((l) => l.replace(/^\s*[-*]\s*/, '').trim())
      .filter(Boolean)

  const status = (value('status') ?? 'idle') as Status

  return {
    status: STATUSES.includes(status) ? status : 'idle',
    issue: value('issue'),
    task: value('task'),
    branch: value('branch'),
    updated: value('updated'),
    pending: Number(value('pending') ?? 0),
    questions: list(SECTION.questions),
    now: (markdown.match(/## Now\n([\s\S]*?)(?=\n## |$)/)?.[1] ?? '').trim(),
    done: list(SECTION.done),
    next: list(SECTION.next),
  }
}

export function renderProgress(p: Progress): string {
  const section = (heading: string, lines: string[]) =>
    `## ${heading}\n\n${lines.length ? lines.map((l) => `- ${l}`).join('\n') : '(なし)'}`

  return dedent`
    ---
    status: ${p.status}
    issue: ${p.issue ?? ''}
    task: ${p.task ?? ''}
    branch: ${p.branch ?? ''}
    updated: ${p.updated ?? ''}
    pending: ${p.pending}
    ---

    ## Now

    ${p.now || '(なし)'}

    ${section(SECTION.done, p.done)}

    ${section(SECTION.next, p.next)}

    ${section(SECTION.questions, p.questions)}
  `
}

export function progress(args: Infer<typeof ARGS_SCHEMA>): string {
  const workingDir = args.workingDir ?? '.'
  const path = `${workingDir}/${PROGRESS_PATH}`

  // ─── Phase 1: 現状の読み込み ───────────────────────────────
  phase('現状の読み込み')

  const current = parseProgress(readFile(path))

  const branch =
    current?.branch ?? runCommand([`cd ${workingDir} && git rev-parse --abbrev-ref HEAD`])?.trim() ?? null

  const base: Progress = current ?? {
    status: 'idle',
    issue: branch?.match(/(\d+)/)?.[1] ?? null,
    task: null,
    branch,
    updated: null,
    pending: 0,
    questions: [],
    now: '',
    done: [],
    next: [],
  }

  if (
    !args.status &&
    !args.task &&
    !args.now &&
    !args.done &&
    !args.next &&
    !args.questions &&
    !args.resolved
  )
    return renderProgress(base)

  // ─── Phase 2: 更新 ─────────────────────────────────────────
  phase('更新')

  const questions = [
    ...base.questions.filter(
      (q) => !(args.resolved ?? []).some((r) => q.startsWith(r) || r.startsWith(q)),
    ),
    ...(args.questions ?? []),
  ]

  const updated: Progress = {
    status: args.status ?? base.status,
    issue: base.issue,
    task: args.task ?? base.task,
    branch,
    updated: runCommand(['date -u +%FT%TZ'])?.trim() ?? base.updated,
    pending: args.pending ?? base.pending,
    questions,
    now: args.now ?? base.now,
    done: [...base.done, ...(args.done ?? [])],
    next: args.next ?? base.next,
  }

  writeFile(path, renderProgress(updated))

  return renderProgress(updated)
}

respond(progress(getArgs(ARGS_SCHEMA)))

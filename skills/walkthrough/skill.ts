import { getArgs } from '../_shared/args.js'
import { type Schema, complete, exit, readFile, respond, writeFile } from '../_shared/complete.js'
import type { Infer } from '../_shared/infer.js'
import { WALKTHROUGH_PATH } from '../_shared/paths.js'
import { dedent } from '../_shared/utils.js'

export const ARGS_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['start', 'next', 'back', 'status', 'end'],
      description: dedent`
        start: 直前の会話（または source）から項目を作り直し、1件目を提示する
        next: 「次」「continue」等。保存済みの続きから次の項目を提示する（保存が無ければ start と同じ）
        back: 1つ前の項目をもう一度提示する
        status: 項目一覧と現在位置だけを表示する
        end: 進行中の walkthrough を終了して保存を破棄する
      `,
    },
    source: {
      type: ['string', 'null'],
      description:
        'string: 項目化する対象を明示したい場合の指定（"レビュー結果" 等の指し示しでよい）, null: 直前の会話から判断する',
    },
  },
  required: ['action', 'source'],
} as const satisfies Schema

const ITEMS_SCHEMA = {
  type: 'object',
  properties: {
    subject: { type: 'string', description: '何についての walkthrough かを短く（例: レビュー指摘 / 実装計画）' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: '見出しに使う短い名前。元の表記をできるだけ残す' },
          source: {
            type: 'string',
            description: '元の記載内容をそのまま。解説はここではしない（後で1件ずつ展開するため）',
          },
        },
        required: ['label', 'source'],
      },
      description: '提示された順序を保った項目一覧。まとめたり省いたりしない',
    },
  },
  required: ['subject', 'items'],
} as const satisfies Schema

const DETAIL_SCHEMA = {
  type: 'object',
  properties: {
    heading: { type: 'string', description: '項目の見出し。元のラベル・レベル表記があれば残す' },
    what: { type: 'string', description: '内容: 何が書かれているかを、対象箇所を示しつつ簡潔に' },
    why: {
      type: 'string',
      description: 'なぜそうなのか: 背景・理由・放置した場合の影響を、このリポジトリの実際のコードに即して',
    },
    how: {
      type: 'array',
      items: { type: 'string' },
      description: 'どうするか: 取りうる対応を具体的に。複数あるなら選択肢として並べる',
    },
    ask: { type: 'string', description: '確認したいこと: ユーザーに決めてほしい論点を1つだけ' },
  },
  required: ['heading', 'what', 'why', 'how', 'ask'],
} as const satisfies Schema

type State = { subject: string; index: number; items: { label: string; source: string }[] }

function render(state: State, detail: Infer<typeof DETAIL_SCHEMA>): string {
  const rest = state.items
    .map((item, i) => ({ item, i }))
    .filter(({ i }) => i > state.index)
    .map(({ item, i }) => `${i + 1} ${item.label}`)

  return dedent`
    ── ${state.index + 1} / ${state.items.length} ─────────────────────────────────

    ## ${detail.heading}

    ### 内容

    ${detail.what}

    ### なぜそうなのか

    ${detail.why}

    ### どうするか

    ${detail.how.map((h, i) => (detail.how.length === 1 ? h : `${i + 1}. ${h}`)).join('\n')}

    ### 確認したいこと

    ${detail.ask}

    ─────────────────────────────────────
    ${rest.length ? `残り: ${rest.join(' / ')}\n「次」で次の項目へ` : 'これが最後の項目です'}
  `
}

export function walkthrough(args: Infer<typeof ARGS_SCHEMA>): string {
  const { action, source } = args
  const saved = readFile(WALKTHROUGH_PATH)
  const state: State | null = saved ? JSON.parse(saved) : null

  // ─── Phase 1: 終了・状態表示 ───────────────────────────────
  phase('終了・状態表示')

  if (action === 'end') {
    writeFile(WALKTHROUGH_PATH, '')
    exit(state ? `${state.subject} の walkthrough を終了しました` : '進行中の walkthrough はありません')
  }

  if (action === 'status') {
    if (!state) exit('進行中の walkthrough はありません')
    exit(dedent`
      ${state.subject}（${state.index + 1} / ${state.items.length}）

      ${state.items.map((item, i) => `${i === state.index ? '▶' : ' '} ${i + 1} ${item.label}`).join('\n')}
    `)
  }

  // ─── Phase 2: 項目リストの用意 ─────────────────────────────
  phase('項目リストの用意')

  const needsExtract = action === 'start' || !state
  const current: State = needsExtract
    ? {
        ...complete(
          dedent`
            ${source ? `「${source}」の内容` : 'このセッションで直前に提示された内容（レビュー指摘・実装計画・調査結果など、複数の項目が並んでいるもの）'}を、
            1つずつ話し合うための項目リストにしてください

            - 提示された順序をそのまま保つ
            - 項目をまとめたり省いたりしない。粒度も変えない
            - source には元の記載をそのまま入れる。ここでは解説・要約をしない
          `,
          ITEMS_SCHEMA,
        ),
        index: 0,
      }
    : { ...state, index: action === 'back' ? Math.max(0, state.index - 1) : state.index + 1 }

  if (current.items.length === 0) exit('1つずつ話し合える項目が見つかりませんでした')

  if (current.index >= current.items.length) {
    writeFile(WALKTHROUGH_PATH, '')
    exit(`${current.subject} の全 ${current.items.length} 件が終わりました`)
  }

  // ─── Phase 3: 現在の項目を詳しく展開 ───────────────────────
  phase('現在の項目を詳しく展開')

  const item = current.items[current.index]

  const detail = complete(
    dedent`
      以下の項目について、ユーザーと1つずつ話し合うための解説を作ってください

      対象（${current.subject} の ${current.index + 1} 件目）:
      ${item.label}
      ${item.source}

      - 必要なら実際のコードを読んで、このリポジトリの状況に即した内容にする
      - why はこの項目に固有の理由を書く。一般論で埋めない
      - how は実際に取りうる対応だけを挙げる。選択肢が1つしかないなら1つでよい
      - ask はユーザーが決めるべき論点を1つだけ。複数聞かない
    `,
    DETAIL_SCHEMA,
  )

  writeFile(WALKTHROUGH_PATH, JSON.stringify(current, null, 2))

  return render(current, detail)
}

respond(walkthrough(getArgs(ARGS_SCHEMA)))

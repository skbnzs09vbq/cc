import { type Schema, complete } from './complete.js'
import type { Infer } from './infer.js'

export function getArgs<S extends Schema>(schema: S): Infer<S> {
  return complete(
    'args（このスキル呼び出し時に渡された引数）の内容を、指定された形に従って構造化して返してください',
    schema,
  )
}

export function parseArgs(): string {
  return getArgs({ type: 'string', description: '自由記述の引数文字列' } as const)
}

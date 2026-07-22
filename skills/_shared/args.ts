import { complete, Schema } from './complete.js'

export function getArgs<T = any>(schema: Schema): T {
  return complete<T>('args（このスキル呼び出し時に渡された引数）の内容を、指定された形に従って構造化して返してください。', schema)
}

export function parseArgs(): string {
  return getArgs<string>({ type: 'string', description: '自由記述の引数文字列' })
}

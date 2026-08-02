import type { Infer } from './infer.js'
import { dedent } from './utils.js'

export type JsonType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null'

export interface Schema {
  type?: JsonType | readonly JsonType[]
  enum?: readonly any[]
  description?: string
  properties?: Record<string, Schema>
  required?: readonly string[]
  items?: Schema
}

export const CONFIRM_SCHEMA = {
  type: 'object',
  properties: { confirmed: { type: 'boolean' } },
  required: ['confirmed'],
} as const satisfies Schema

export declare function complete<S extends Schema | undefined = undefined>(
  prompt: string,
  schema?: S,
): S extends Schema ? Infer<S> : any

export function generate(prompt: string): string {
  return complete(prompt, { type: 'string' } as const)
}

export declare function respond(value: any): void

export class ExitSignal extends Error {}

export function exit(value?: any): never {
  if (value !== undefined) respond(value)
  throw new ExitSignal()
}

export function receive<S extends Schema | undefined = undefined>(
  schema?: S,
): S extends Schema ? Infer<S> : any {
  return complete(
    'ユーザーからの回答を受け取り、その内容を返してください',
    (schema ?? { type: 'string' }) as any,
  ) as any
}

export declare function readFile(path: string): string | null

export declare function writeFile(path: string, content: string): void

export function buildCommandPrompt(prompt: string, commands: string[]): string {
  return dedent`
    ${prompt}
    結果が得られない場合・失敗した場合は null を返してください

    実行コマンド:
    ${commands.map((c) => `  ${c}`).join('\n')}
  `
}

export function runCommand(commands: string[]): string | null {
  return complete(buildCommandPrompt('その結果を返してください', commands), {
    type: ['string', 'null'],
  } as const)
}

export function remember(notes: string[]) {
  complete(dedent`
    このスクリプトの実行全体を通して、以下の注意事項を守ってください

    ${notes.map((n) => `- ${n}`).join('\n')}
  `)
}

export function askUser<S extends Schema | undefined = undefined>(
  message: string,
  schema?: S,
): S extends Schema ? Infer<S> : any {
  respond(message)
  return receive(schema)
}

export function runTool(tool: string): string | null {
  return complete(
    dedent`
      以下の MCP ツールを実際に呼び出し、結果をそのまま返してください
      結果が得られない場合・失敗した場合は null を返してください

      呼び出すツール: ${tool}
    `,
    { type: ['string', 'null'] } as const,
  )
}

import type { JsonType, Schema } from './complete.js'

type JsonTypeToTs<T> = T extends 'string'
  ? string
  : T extends 'number' | 'integer'
    ? number
    : T extends 'boolean'
      ? boolean
      : T extends 'null'
        ? null
        : T extends 'array'
          ? any[]
          : T extends 'object'
            ? Record<string, any>
            : never

type RequiredKeys<S extends Schema> = S['required'] extends readonly string[]
  ? S['required'][number]
  : never

type InferProperties<S extends Schema> = S['properties'] extends Record<string, Schema>
  ? {
      [K in keyof S['properties'] as K extends RequiredKeys<S> ? K : never]: Infer<
        S['properties'][K]
      >
    } & {
      [K in keyof S['properties'] as K extends RequiredKeys<S> ? never : K]?: Infer<
        S['properties'][K]
      >
    }
  : Record<string, any>

type InferSingle<S extends Schema, T> = T extends 'object'
  ? InferProperties<S>
  : T extends 'array'
    ? S['items'] extends Schema
      ? Infer<S['items']>[]
      : any[]
    : JsonTypeToTs<T>

type InferByType<S extends Schema> = S['type'] extends readonly JsonType[]
  ? InferSingle<S, S['type'][number]>
  : S['type'] extends JsonType
    ? InferSingle<S, S['type']>
    : any

/**
 * Schema（`: Schema` で明示annotationせず `as const satisfies Schema` で定義したもの）から、
 * 対応する TS の型を再構成する\nrequired に無いキーは optional になる
 * enum があれば type ではなく enum の要素のリテラルunion型を優先する
 */
export type Infer<S extends Schema> = S['enum'] extends readonly any[]
  ? S['enum'][number]
  : InferByType<S>

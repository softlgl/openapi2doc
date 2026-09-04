export interface ApiServer {
  url: string
  description?: string
}

export interface ApiParameter {
  name: string
  in: string // query / path / header / cookie / body / formData
  required?: boolean
  description?: string
  type?: string
  schemaType?: string // 从 schema 推导的类型
  default?: unknown
  example?: unknown
  format?: string
}

export interface ApiResponse {
  status: string
  description?: string
  schema?: string // 简化后的类型描述，如 `Pet`, `Pet[]`, `Page<Pet>`
  rawString?: string // 原始类型字符串（含泛型/引用）
}

export interface SchemaLike {
  type?: string
  ref?: string // $ref 目标名
  title?: string
  description?: string
  enum?: string
  default?: string
  children?: SchemaLike[] // 对象属性
  items?: SchemaLike // 数组项
  properties?: Record<string, SchemaProperty>
  example?: string
}

export interface SchemaProperty {
  name: string
  required?: boolean
  schema?: SchemaLike
}

export interface ApiOperation {
  id: string
  method: string
  path: string
  summary?: string
  description?: string
  operationId?: string
  deprecated?: boolean
  tags: string[]
  parameters: ApiParameter[]
  responses: ApiResponse[]
  requestBody?: ApiParameter
}

export interface ApiDocument {
  title: string
  version: string
  description?: string
  serverUrl: string
  servers: ApiServer[]
  basePath: string
  tags: { name: string; description?: string }[]
  operations: ApiOperation[]
  schemas: { name: string; schema: SchemaLike }[]
}
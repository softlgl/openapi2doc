// 认证方案：归一化 Swagger 2.0 securityDefinitions 与 OpenAPI 3 securitySchemes
export interface SecuritySchemeDef {
  schemeId: string // securitySchemes 中的键名，供 operation.security 引用
  type: string // apiKey / http / oauth2 / openIdConnect / basic
  displayName: string // 键名（稳定标识，用于概览清单）
  label: string // 短展示标签：Bearer / Basic / Authorization 头 等，接口标题行展示用
  description?: string // 源文件使用说明（可能为长句），只进 tooltip/清单
  in?: string // apiKey 位置：header / query
  param?: string // apiKey 参数名
  scheme?: string // http 子类型：bearer / basic
}

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
  auth?: SecuritySchemeDef[] // 生效的认证方案（已解析全局/操作级 security）
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
  securitySchemes: SecuritySchemeDef[]
  // 全局 security 要求，保留源 JSON 形态（[{ schemeId: scopes }] 或键名数组）；undefined 表示未声明，空数组表示显式无需认证
  security?: unknown[]
}
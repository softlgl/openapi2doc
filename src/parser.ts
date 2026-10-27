import yaml from 'js-yaml'
import type { ApiDocument, ApiServer, ApiOperation, ApiParameter, ApiResponse, SchemaLike, SecuritySchemeDef } from './types'

function extractRefName(ref: string): string {
  return ref.split('/').pop() || ref
}

function normalizeSchema(s: any): SchemaLike {
  if (s.$ref) {
    return { ref: extractRefName(s.$ref) }
  }
  if (Array.isArray(s)) {
    // fallback
    return { type: 'array', items: normalizeSchema(s[0]) }
  }
  if (!s) {
    return {}
  }
  if (Array.isArray(s.enum)) {
    return {
      type: typeof s.type === 'string' ? s.type : 'string',
      enum: JSON.stringify(s.enum, null, 2),
      title: s.title,
      description: s.description,
      default: s.default,
      example: s.example,
    }
  }

  const out: SchemaLike = {
    type: s.type,
    title: s.title,
    description: s.description,
    default: s.default,
    example: s.example,
  }

  if (s.$ref) {
    out.ref = extractRefName(s.$ref)
  }

  if (s.type === 'object' || s.properties) {
    if (s.properties && typeof s.properties === 'object') {
      out.properties = {}
      const required = s.required || []
      for (const [k, v] of Object.entries(s.properties)) {
        out.properties[k] = {
          name: k,
          required: Array.isArray(required) ? required.includes(k) : !!(v as any).required,
          schema: normalizeSchema(v),
        }
      }
    }
    if (s.additionalProperties && typeof s.additionalProperties === 'object') {
      // keep it simple
      out.properties = out.properties || {}
      // TODO: handle additionalProperties
    }
  } else if (s.type === 'array' && s.items) {
    out.items = normalizeSchema(s.items)
  }

  return out
}

function buildSchemaFromRefOrInline(s: any): { ref: string; schema: SchemaLike } {
  if (!s) {
    return { ref: '', schema: {} }
  }
  if (s.$ref) {
    return { ref: extractRefName(s.$ref), schema: normalizeSchema(s) }
  }
  return { ref: '', schema: normalizeSchema(s) }
}

function schemaToString(s: any): string {
  if (!s) return 'any'
  if (s.$ref) {
    return extractRefName(s.$ref)
  }
  if (s.type === 'array' && s.items) {
    const inner = schemaToString(s.items)
    return `${inner}[]`
  }
  if (s.type && typeof s.type === 'string') return s.type
  return 'object'
}

function getBasePathFromServers(doc: any, defaultBase: string): string {
  // OpenAPI 3.x servers vs Swagger 2.0 basePath
  if (Array.isArray(doc.servers) && doc.servers.length) {
    const url = doc.servers[0]?.url || ''
    return url || defaultBase
  }
  if (typeof doc.basePath === 'string') {
    return doc.basePath || ''
  }
  return ''
}

function getFirstServer(doc: any): ApiServer | null {
  if (Array.isArray(doc.servers) && doc.servers[0]) {
    return {
      url: doc.servers[0].url || '',
      description: doc.servers[0].description || '',
    }
  }
  if (doc.host && doc.basePath) {
    const scheme = doc.schemes && Array.isArray(doc.schemes) ? doc.schemes[0] : 'http'
    const url = `${scheme}://${doc.host}${doc.basePath}`
    return { url, description: '' }
  }
  return null
}

function parseParameters(params: any[] | undefined, _components: any): ApiParameter[] {
  if (!params || !Array.isArray(params)) return []
  return params.map(p => {
    // swagger 2.0: 非 body 参数直接在参数对象上带 type / items
    const schema: any = p.schema || (p.type || p.items ? { type: p.type, items: p.items } : undefined)
    const { ref } = buildSchemaFromRefOrInline(schema)
    // format 信息（如 uuid / date-time）附加到类型展示，形如 string($uuid)
    const fmt = (p.schema && typeof p.schema.format === 'string' && p.schema.format) || (typeof p.format === 'string' && p.format) || ''
    const base = schemaToString(schema)
    const out: ApiParameter = {
      name: p.name,
      in: p.in || 'query',
      required: Boolean(p.required),
      description: p.description || '',
      type: fmt ? `${base}($${fmt})` : base,
      schemaType: ref || undefined,
      default: p.default,
      example: p.example,
      format: p.format,
    }
    return out
  })
}

function parseResponses(responses: any, _components: any): ApiResponse[] {
  if (!responses || typeof responses !== 'object') return []
  const out: ApiResponse[] = []
  for (const [status, resp] of Object.entries(responses)) {
    const r = resp as any
    const schema: any = r.schema || (r.content && Object.values(r.content)[0] && (Object.values(r.content)[0] as any).schema)
    const desc = r.description || ''
    const rawSchemaStr = schemaToString(schema)
    const { ref } = buildSchemaFromRefOrInline(schema)
    out.push({
      status,
      description: desc,
      schema: ref || rawSchemaStr,
    })
  }
  return out
}

// 从方案定义派生短展示标签：键名太无语义时按类型与参数名归并（如 apiKey+Authorization 头 → Bearer JWT）
function deriveAuthLabel(d: { type: string; schemeId: string; in?: string; param?: string; scheme?: string }): string {
  if (d.type === 'http') return d.scheme === 'bearer' ? 'Bearer' : d.scheme ? cap(d.scheme) : 'Basic'
  if (d.type === 'apiKey') {
    if (d.param && /^authorization$/i.test(d.param.trim())) return 'Bearer JWT'
    return d.param ? `${d.param}${d.in === 'query' ? ' 查询参数' : ' 头'}` : d.schemeId
  }
  if (d.type === 'oauth2') return 'OAuth2'
  if (d.type === 'openIdConnect') return 'OpenID Connect'
  return d.schemeId
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

// 归一化认证方案定义：兼容 OpenAPI 3 components.securitySchemes 与 Swagger 2 securityDefinitions
function parseSecuritySchemes(obj: any): SecuritySchemeDef[] {
  const defs: Record<string, any> = (obj.components?.securitySchemes && typeof obj.components.securitySchemes === 'object')
    ? obj.components.securitySchemes
    : (obj.securityDefinitions && typeof obj.securityDefinitions === 'object') ? obj.securityDefinitions : {}
  const out: SecuritySchemeDef[] = []
  for (const [schemeId, raw] of Object.entries(defs)) {
    const s = raw as any
    if (!s || typeof s !== 'object') continue
    let type = typeof s.type === 'string' ? s.type : ''
    // Swagger 2.0 的 basic 类型等价于 OpenAPI 3 的 http+basic
    if (type === 'basic') type = 'http'
    const base: SecuritySchemeDef = {
      schemeId,
      type,
      displayName: schemeId,
      label: '',
      description: typeof s.description === 'string' ? s.description : '',
      in: typeof s.in === 'string' ? s.in : undefined,
      param: typeof s.name === 'string' ? s.name : undefined,
      scheme: type === 'http' ? (s.scheme || 'basic') : undefined,
    }
    base.label = deriveAuthLabel(base)
    out.push(base)
  }
  return out
}

// 从单个 security 要求项提取方案键名：对象形式 { schemeId: scopes } 取键名；已是键名数组时直接用
function schemeIdsOf(req: any): string[] {
  if (Array.isArray(req)) return req.map(String)
  if (req && typeof req === 'object') return Object.keys(req)
  return []
}

// 解析单个操作生效的认证方案：操作级 security 优先，缺省回退全局；[] 表示显式无需认证
// opSec/globalSec 均保留源 JSON 形态（对象或键名数组），统一由 schemeIdsOf 提取
function resolveOpSecurity(opSec: any, globalSec: any[] | undefined, schemeMap: Map<string, SecuritySchemeDef>): SecuritySchemeDef[] | undefined {
  const reqs: any = opSec !== undefined ? opSec : globalSec
  if (!Array.isArray(reqs)) return undefined
  const out: SecuritySchemeDef[] = []
  const seen = new Set<string>()
  for (const req of reqs) {
    for (const name of schemeIdsOf(req)) {
      const d = schemeMap.get(name)
      if (d && !seen.has(name)) {
        seen.add(name)
        out.push(d)
      } else if (!d && !seen.has(name)) {
        // 引用了未定义的方案时降级展示键名
        seen.add(name)
        out.push({ schemeId: name, type: '', displayName: name, label: name })
      }
    }
  }
  return out
}

export function parseOpenApi(source: string | object): { ok: true; doc: ApiDocument } | { ok: false; error: string } {
  let obj: any

  // Try parse JSON/YAML
  if (typeof source === 'string') {
    const trimmed = source.trim()
    try {
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        obj = JSON.parse(source)
      } else {
        obj = yaml.load(source) as any
      }
    } catch (e: any) {
      return { ok: false, error: `解析失败: ${e.message || e}` }
    }
  } else {
    obj = source
  }

  if (!obj || typeof obj !== 'object') {
    return { ok: false, error: '无效的 OpenAPI/Swagger 格式' }
  }

  const isOpenApi3 = obj.openapi && typeof obj.openapi === 'string' && obj.openapi.startsWith('3.')
  const isSwagger2 = obj.swagger && typeof obj.swagger === 'string' && obj.swagger.startsWith('2.')

  if (!isOpenApi3 && !isSwagger2) {
    return { ok: false, error: '此文件不是标准 Swagger 2.0 或 OpenAPI 3.x，请检查格式' }
  }

  const title = obj.info?.title || '接口文档'
  const version = obj.info?.version || '1.0'
  const description = obj.info?.description || ''

  let basePath = getBasePathFromServers(obj, isSwagger2 ? obj.basePath || '' : '')
  if (basePath.startsWith('http') && !basePath.startsWith('/')) {
    // when url is full, let's keep url in server only
    basePath = ''
  }
  const server = getFirstServer(obj)
  const serverUrl = server?.url || basePath || ''

  // collect all servers
  const servers: ApiServer[] = []
  if (Array.isArray(obj.servers)) {
    for (const s of obj.servers) {
      servers.push({
        url: (s as any).url || '',
        description: (s as any).description || '',
      })
    }
  } else if (isSwagger2 && obj.host) {
    const schemes = (obj.schemes && Array.isArray(obj.schemes)) ? obj.schemes : ['http']
    for (const sch of schemes) {
      servers.push({
        url: `${sch}://${obj.host}${obj.basePath || ''}`,
        description: '',
      })
    }
  }

  const components = obj.components || {}
  const securitySchemes = parseSecuritySchemes(obj)
  const schemeMap = new Map(securitySchemes.map((d) => [d.schemeId, d]))
  // 全局 security 保留源 JSON 形态，提取键名统一由 schemeIdsOf 处理
  const globalSecurity: any[] | undefined = Array.isArray(obj.security) ? obj.security : undefined
  const schemasOut: ApiDocument['schemas'] = []

  // collect definitions or schemas
  const schemaDefs = isOpenApi3 ? (components?.schemas || {}) : (obj.definitions || {})
  for (const [name, sch] of Object.entries(schemaDefs)) {
    const s = normalizeSchema(sch)
    schemasOut.push({ name, schema: s })
  }

  const operations: ApiOperation[] = []
  let idSeq = 0

  const tagsMap = new Map<string, { name: string; description?: string }>()
  if (Array.isArray(obj.tags)) {
    for (const tag of obj.tags) {
      tagsMap.set((tag as any).name, { name: (tag as any).name, description: (tag as any).description })
    }
  }

  for (const [path, pathItem] of Object.entries(obj.paths || {})) {
    const pi = pathItem as any
    for (const method of ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace']) {
      const op = pi[method]
      if (!op) continue
      const opTags: string[] = Array.isArray(op.tags) ? op.tags : []
      const baseParams = Array.isArray(pi.parameters) ? pi.parameters : []
      const allParams = [...baseParams, ...(Array.isArray(op.parameters) ? op.parameters : [])]

      // resolve requestBody (OpenAPI 3)
      let requestBody: ApiParameter | undefined
      const rb = op.requestBody
      if (rb) {
        // content: { 'application/json': { schema } }
        const content = rb.content
        if (content && typeof content === 'object') {
          const firstKey = Object.keys(content)[0]
          const media = content[firstKey]
          if (media.schema) {
            requestBody = {
              name: 'requestBody',
              in: 'body',
              required: rb.required === true,
              description: rb.description || '',
              type: schemaToString(media.schema),
              schemaType: schemaToString(media.schema),
            }
          }
        }
      }
      // swagger 2 body
      if (!requestBody && isSwagger2) {
        const bodyParam = allParams.find(p => p.in === 'body')
        if (bodyParam) {
          requestBody = {
            name: 'body',
            in: 'body',
            required: Boolean(bodyParam.required),
            description: bodyParam.description || '',
            type: schemaToString(bodyParam.schema),
            schemaType: schemaToString(bodyParam.schema),
          }
        }
      }

      const parsedParams = parseParameters(allParams, components)

      // resolve tags to tagsMap for tags list
      for (const tag of opTags) {
        if (!tagsMap.has(tag)) {
          tagsMap.set(tag, { name: tag, description: '' })
        }
      }

      operations.push({
        id: `op-${++idSeq}`,
        method: method.toUpperCase(),
        path,
        summary: op.summary || '',
        description: op.description || '',
        operationId: op.operationId,
        deprecated: Boolean(op.deprecated),
        tags: opTags,
        parameters: parsedParams,
        responses: parseResponses(op.responses, components),
        requestBody,
        auth: resolveOpSecurity(op.security, globalSecurity, schemeMap),
      })
    }
  }

  const tags = Array.from(tagsMap.values())

  return {
    ok: true,
    doc: {
      title,
      version,
      description,
      serverUrl,
      servers,
      basePath,
      tags,
      operations,
      schemas: schemasOut,
      securitySchemes,
      security: globalSecurity,
    },
  }
}

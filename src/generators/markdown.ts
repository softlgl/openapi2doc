import type { ApiDocument, ApiOperation, ApiParameter, ApiResponse, SchemaLike } from '../types'

// 净化 C# 泛型完整名：去掉 `` `1[[...]] `` 尾部（含裸反引号，会破坏 Markdown 渲染），得纯模型名
function cleanName(s: string): string {
  let str = String(s || '').trim().replace(/^array\s+of\s+/i, '')
  const idx = str.search(/`\d+(\[\[)/)
  if (idx >= 0) str = str.slice(0, idx)
  return str
}

// 类型列文本：纯模型名 + 可选 []（与 HTML 一致，避免裸反引号坏表格）
function cleanType(s: string): string {
  let str = String(s || '').trim().replace(/^array\s+of\s+/i, '')
  const arr = str.slice(-2) === '[]' ? '[]' : ''
  return cleanName(str) + arr
}

// 枚举值 → 字符串数组（解析字符串化数组）
function enumValues(s: SchemaLike): string[] {
  let raw: unknown = s.enum
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw) } catch { raw = [raw] }
  }
  return (Array.isArray(raw) ? raw : [raw]).map(String)
}

// 从描述解析“值 → 说明”（与 HTML 一致）
function enumLabels(s: SchemaLike): Record<string, string> {
  const map: Record<string, string> = {}
  const re = /(?:^|[\r\n;；])\s*([0-9a-zA-Z_-]+)\s*(?:[-–= ]+|\s+is\s+)\s*(.+?)\s*(?=$|[\r\n;；])/g
  let m
  const d = String(s.description || '')
  while ((m = re.exec(d)) !== null) map[String(m[1]).trim()] = String(m[2]).trim()
  return map
}

// 枚举 → “取值=说明”串，用于类型列；无说明时只显示取值
function enumText(s: SchemaLike): string {
  const labels = enumLabels(s)
  return `枚举: ${enumValues(s).map(v => `${v}${labels[v] ? `=${labels[v]}` : ''}`).join(', ')}`
}

// 定位 schema 或其引用/数组项中真正的枚举定义；无则返回 undefined
function enumSchema(s: SchemaLike | undefined, dict: Record<string, SchemaLike> | undefined): SchemaLike | undefined {
  if (!s) return undefined
  if (s.enum) return s
  const t = s.ref ? dict?.[s.ref] : undefined
  if (t?.enum) return t
  const it = s.items || {}
  const itRef = it.ref ? dict?.[it.ref] : undefined
  if (itRef?.enum) return itRef
  if (it.enum) return it
  return undefined
}

// 单行纯文本类型 token
function token(s: SchemaLike | undefined, dict: Record<string, SchemaLike> | undefined): string {
  if (!s) return '?'
  const es = enumSchema(s, dict)
  if (es) return enumText(es)
  if (s.ref) return cleanName(s.ref)
  if (s.type === 'array' && s.items) {
    const i = s.items
    if (i.ref) return cleanName(i.ref) + '[]'
    if (i.properties) return 'object[]'
    return token(i, dict) + '[]'
  }
  if (s.type === 'object') return s.title ? cleanName(s.title) : 'object'
  return s.type || s.title || 'string'
}

// 单元格文本转义（表格内的 | 需转义，换行折叠为空格）
function cell(s: string): string {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ')
}

// 递归展开对象结构为表格行：[字段名, 类型, 必填, 说明, 层级]。复杂对象用缩进展示子字段，不显示类型名。
function structRows(sch: SchemaLike, dict: Record<string, SchemaLike>, level: number): string[][] {
  const rows: string[][] = []
  if (level > 6) return rows
  for (const [n, p] of Object.entries(sch.properties || {})) {
    const s = p.schema
    const req = p.required ? '是' : '否'
    const desc = s?.description ? s.description.replace(/\n+/g, ' ') : ''
    let type = ''
    let child: SchemaLike | undefined
    if (s?.ref && dict?.[s.ref]?.properties) { child = dict[s.ref] }
    else if (s?.type === 'object' && s.properties) { child = s }
    else if (s?.type === 'array' && s.items?.ref && dict?.[s.items.ref]?.properties) { child = dict[s.items.ref] }
    else if (s?.type === 'array' && s.items?.properties) { child = s.items }
    else type = token(s, dict)

    if (child && child.properties) {
      // 复杂对象：仅展示字段名与说明，类型列留空，子字段缩进
      rows.push([n, '', req, desc, String(level)])
      rows.push(...structRows(child, dict, level + 1))
    } else {
      rows.push([n, type || '-', req, desc, String(level)])
    }
  }
  return rows
}

// 渲染结构表格（复杂对象缩进展示，无对象名/代码块包裹）
function renderModelBlock(sch: SchemaLike, dict: Record<string, SchemaLike>): string {
  const rows = structRows(sch, dict, 0)
  if (!rows.length) return `\`${token(sch, dict)}\`\n`
  const head = '| 字段 | 类型 | 必填 | 说明 |\n| --- | --- | --- | --- |\n'
  // 用 &nbsp; 缩进，避免普通空格被表格渲染器折叠，且不被 cell() 转义
  const body = rows.map(r => {
    const indent = '&nbsp;'.repeat(Number(r[4]) * 2)
    return `| ${indent}${cell(r[0])} | ${cell(r[1])} | ${r[2]} | ${cell(r[3])} |`
  }).join('\n')
  return head + body + '\n'
}

// 从类型字符串解析可能命中的模型名（兼容 C# 完整 $ref 名 / 数组前缀）
function modelNames(s: string, dict: Record<string, SchemaLike>): string[] {
  const out: string[] = []
  const added: Record<string, boolean> = {}
  const raw = String(s || '').trim()
  const candidates = [raw, raw.replace(/^array\s+of\s+/i, '').replace(/\[\]$/, '')]
  for (const n of candidates) {
    if (n && dict[n] && !added[n]) {
      added[n] = true
      out.push(n)
    }
  }
  return out
}

// 渲染单个模型的字段结构表格
function renderRefFields(name: string, dict: Record<string, SchemaLike>): string {
  const sch = dict[name]
  if (!sch || !sch.properties) return ''
  return renderModelBlock(sch, dict)
}

function renderParameters(params: ApiParameter[]): string {
  if (!params || params.length === 0) return '(无)\n'
  const lines: string[] = []
  lines.push('| 参数名称 | 位置 | 必填 | 类型 | 说明 |\n')
  lines.push('| --- | --- | --- | --- | --- |\n')
  for (const p of params) {
    const req = p.required ? '是' : '否'
    const type = cleanType(String(p.schemaType || p.type || '')) || '-'
    const desc = (p.description || '').replace(/\n/g, ' ')
    lines.push(`| ${p.name} | ${p.in} | ${req} | ${type} | ${desc} |\n`)
  }
  return lines.join('')
}

function renderResponses(responses: ApiResponse[], dict: Record<string, SchemaLike>): string {
  if (!responses || responses.length === 0) return '(无)\n'
  const lines: string[] = []
  lines.push('| 状态码 | 说明 | 响应类型 |\n')
  lines.push('| --- | --- | --- |\n')
  for (const r of responses) {
    lines.push(`| ${r.status} | ${r.description || ''} | ${cleanType(r.schema || '') || '-'} |\n`)
  }
  const bodies = new Set<string>()
  for (const r of responses) {
    modelNames(r.schema || '', dict).forEach((n) => bodies.add(n))
  }
  if (bodies.size) {
    lines.push('\n**响应体结构**\n\n')
    bodies.forEach((n) => {
      lines.push(renderRefFields(n, dict))
      lines.push('\n')
    })
  }
  return lines.join('')
}

function renderOperation(op: ApiOperation, doc: ApiDocument): string {
  const dict: Record<string, SchemaLike> = {}
  for (const s of doc.schemas || []) dict[s.name] = s.schema
  const lines: string[] = []
  const fullPath = (doc.basePath || '') + op.path
  lines.push(`### ${op.method} \`${fullPath}\` ${op.summary || ''}\n\n`)

  if (op.description) {
    lines.push(`${op.description}\n\n`)
  }
  if (op.deprecated) {
    lines.push(`> ⚠️ **已废弃**\n\n`)
  }

  if (op.parameters && op.parameters.length > 0) {
    lines.push(`#### 请求参数\n\n`)
    lines.push(renderParameters(op.parameters))
    lines.push(`\n`)
  }

  if (op.requestBody) {
    lines.push(`#### 请求体\n\n`)
    lines.push(`${renderParameters([op.requestBody])}\n`)
    const rbNames = modelNames(op.requestBody.schemaType || op.requestBody.type || '', dict)
    if (rbNames.length) {
      lines.push('\n**请求体结构**\n\n')
      rbNames.forEach((n) => {
        lines.push(renderRefFields(n, dict))
        lines.push('\n')
      })
    }
  }

  if (op.responses && op.responses.length > 0) {
    lines.push(`#### 响应\n\n`)
    lines.push(renderResponses(op.responses, dict))
    lines.push(`\n`)
  }
  return lines.join('')
}

export function generateMarkdown(doc: ApiDocument): string {
  const lines: string[] = []
  lines.push(`# ${doc.title}\n\n`)
  lines.push(`**版本**: ${doc.version}  \n`)
  if (doc.serverUrl) {
    lines.push(`**服务地址**: ${doc.serverUrl}\n`)
  }
  lines.push('\n')

  if (doc.description) {
    lines.push(`${doc.description}\n\n`)
  }

  const byTag = new Map<string, ApiOperation[]>()
  for (const tag of doc.tags) {
    byTag.set(tag.name, [])
  }
  byTag.set('其他', [])

  for (const op of doc.operations) {
    if (!op.tags || op.tags.length === 0) {
      byTag.get('其他')!.push(op)
      continue
    }
    // assign to first tag
    const firstTag = op.tags[0]
    if (byTag.has(firstTag)) {
      byTag.get(firstTag)!.push(op)
    } else {
      byTag.get('其他')!.push(op)
    }
  }

  for (const [tag, ops] of byTag.entries()) {
    if (ops.length === 0) continue
    const tagObj = doc.tags.find(t => t.name === tag)
    lines.push(`---\n\n## ${tag}\n\n`)
    if (tagObj?.description) {
      lines.push(`${tagObj.description}\n\n`)
    }
    for (const op of ops) {
      lines.push(renderOperation(op, doc))
    }
  }

  return lines.join('')
}

import { parseOpenApi } from '../src/parser.ts'
import { generateMarkdown } from '../src/generators/markdown.ts'
import { generateHtml } from '../src/generators/html.ts'
import { readFileSync, writeFileSync } from 'node:fs'

const raw = readFileSync('public/demo.json', 'utf8')
let obj: any
let isJson = false
let disposed = raw.slice(0, 200)
try {
  obj = JSON.parse(raw)
  isJson = true
} catch {
  disposed = '(JSON 解析失败，前200字符):' + raw.slice(0, 200)
}

console.log('头部200字符:', JSON.stringify(raw.slice(0, 120)))
if (isJson) {
  console.log('顶层keys:', Object.keys(obj))
  console.log('swagger 字段:', obj.swagger, '| openapi 字段:', obj.openapi)
  console.log('paths 类型:', Array.isArray(obj.paths) ? 'ARRAY(!)' : typeof obj.paths)
  console.log('paths 数量:', obj.paths ? Object.keys(obj.paths).length : 0)
}

const out = parseOpenApi(raw)
if (!out.ok) {
  console.log('\n解析失败:', out.error)
  process.exit(1)
}
const d = out.doc
console.log('\n解析成功')
console.log('title:', d.title, '| version:', d.version)
console.log('serverUrl:', d.serverUrl)
console.log('operations:', d.operations.length)
console.log('schemas:', d.schemas.length)
console.log('tags:', d.tags.map(t => t.name).join(', '))
for (const op of d.operations.slice(0, 8)) {
  console.log(`  ${op.method} ${op.path} summary=${op.summary?.slice(0,30)} params=${op.parameters.length} resp=${op.responses.length}`)
}
const md = generateMarkdown(d)
console.log('\nMarkdown 长度:', md.length, '| 前300:', JSON.stringify(md.slice(0, 300)))

const html = generateHtml(d)
writeFileSync('demo.html', html, 'utf8')
writeFileSync('demo.md', md, 'utf8')
console.log('已生成 demo.html (' + html.length + ' bytes) 与 demo.md (' + md.length + ' bytes)')
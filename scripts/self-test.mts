import { parseOpenApi } from '../src/parser.ts'
import { generateMarkdown } from '../src/generators/markdown.ts'
import { generateHtml } from '../src/generators/html.ts'
import { readFileSync } from 'node:fs'

const sample = readFileSync(new URL('../sample-petstore.json', import.meta.url), 'utf8')
const out = parseOpenApi(sample)
if (!out.ok) {
  console.error('FAIL:', out.error)
  process.exit(1)
}
console.log('title:', out.doc!.title)
console.log('version:', out.doc!.version)
console.log('server:', out.doc!.serverUrl)
console.log('servers:', JSON.stringify(out.doc!.servers))
console.log('operations:', out.doc!.operations.length)
console.log('schemas:', out.doc!.schemas.length)
for (const op of out.doc!.operations.slice(0, 3)) {
  console.log(`  ${op.method} ${op.path} params=${op.parameters.length} responses=${op.responses.length}`)
}
const md = generateMarkdown(out.doc!)
console.log('\n--- MARKDOWN (head) ---')
console.log(md.split('\n').slice(0, 12).join('\n'))
const html = generateHtml(out.doc!)
console.log('\n--- HTML bytes:', html.length, 'has DOCTYPE:', html.startsWith('<!doctype'))
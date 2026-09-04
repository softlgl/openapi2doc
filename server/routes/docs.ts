// 文档 CRUD 路由
import { Router, type Request, type Response } from 'express'
import { getPool, ensureGroup, type DocRow } from '../db.ts'

export const docsRouter = Router()

// 数据库行 -> API 对象（tags 从 JSON 字符串解析为数组）
function parseTags(raw: string): string[] {
  try {
    const t = JSON.parse(raw)
    return Array.isArray(t) ? t.map(String) : []
  } catch {
    return []
  }
}

function toMeta(r: DocRow) {
  return {
    id: r.id,
    name: r.name,
    group: r.group_name,
    tags: parseTags(r.tags),
    description: r.description,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

// 列表：支持 ?group= 与 ?q=（按名称模糊搜索），不带 source 以保持轻量
docsRouter.get('/', async (req: Request, res: Response) => {
  const { group, q } = req.query
  const where: string[] = []
  const params: string[] = []
  if (typeof group === 'string' && group) {
    where.push('group_name = ?')
    params.push(group)
  }
  if (typeof q === 'string' && q) {
    where.push('name LIKE ?')
    params.push(`%${q}%`)
  }
  const cond = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const [rows] = await getPool().query<DocRow[]>(
    `SELECT id, name, group_name, tags, description, created_at, updated_at
     FROM documents ${cond} ORDER BY updated_at DESC`,
    params
  )
  res.json(rows.map(toMeta))
})

// 批量移动文档到分组
docsRouter.post('/bulk-move', async (req: Request, res: Response) => {
  const body = (req.body || {}) as { ids?: unknown; group?: unknown }
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    res.status(400).json({ message: '请选择要移动的文档' })
    return
  }
  const ids = body.ids.map(Number).filter((n) => Number.isInteger(n))
  if (!ids.length) {
    res.status(400).json({ message: '无效的文档 ID' })
    return
  }
  const group = typeof body.group === 'string' ? body.group.trim() : ''
  await ensureGroup(group)
  await getPool().query(
    `UPDATE documents SET group_name = ? WHERE id IN (${ids.map(() => '?').join(',')})`,
    [group, ...ids]
  )
  res.json({ moved: ids.length, group })
})

// 批量删除文档
docsRouter.post('/bulk-delete', async (req: Request, res: Response) => {
  const body = (req.body || {}) as { ids?: unknown }
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    res.status(400).json({ message: '请选择要删除的文档' })
    return
  }
  const ids = body.ids.map(Number).filter((n) => Number.isInteger(n))
  if (!ids.length) {
    res.status(400).json({ message: '无效的文档 ID' })
    return
  }
  const [result] = await getPool().query(
    `DELETE FROM documents WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids
  )
  res.json({ deleted: (result as { affectedRows: number }).affectedRows })
})

// 单篇详情（含 source，用于预览/编辑）
docsRouter.get('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) {
    res.status(400).json({ message: '无效的文档 ID' })
    return
  }
  const [rows] = await getPool().query<DocRow[]>(
    `SELECT * FROM documents WHERE id = ?`,
    [id]
  )
  if (!rows.length) {
    res.status(404).json({ message: '文档不存在' })
    return
  }
  const r = rows[0]
  res.json({ ...toMeta(r), source: r.source })
})

interface DocBody {
  name?: unknown
  group?: unknown
  tags?: unknown
  description?: unknown
  source?: unknown
}

// 校验 type-o：确保字段类型合法，返回清理后的对象
function sanitize(body: DocBody): { name: string; group: string; tags: string[]; description: string; source: string } {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const group = typeof body.group === 'string' ? body.group.trim() : ''
  const rawTags = Array.isArray(body.tags) ? (body.tags as unknown[]) : []
  const tags = rawTags.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean)
  const description = typeof body.description === 'string' ? body.description : ''
  const source = typeof body.source === 'string' ? body.source : ''
  return { name, group, tags, description, source }
}

// 新建
docsRouter.post('/', async (req: Request, res: Response) => {
  const data = sanitize(req.body || {})
  if (!data.name) {
    res.status(400).json({ message: '文档名称不能为空' })
    return
  }
  if (!data.source.trim()) {
    res.status(400).json({ message: '接口源内容不能为空' })
    return
  }
  const [result] = await getPool().execute(
    `INSERT INTO documents (name, group_name, tags, description, source) VALUES (?, ?, ?, ?, ?)`,
    [data.name, data.group, JSON.stringify(data.tags), data.description, data.source]
  )
  await ensureGroup(data.group)
  const insertId = (result as { insertId: number }).insertId
  res.status(201).json({ id: insertId })
})

// 更新（部分字段）
docsRouter.put('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) {
    res.status(400).json({ message: '无效的文档 ID' })
    return
  }
  const body = (req.body || {}) as DocBody
  // 仅更新传入的字段
  const sets: string[] = []
  const params: unknown[] = []
  if (typeof body.name === 'string') {
    sets.push('name = ?')
    params.push(body.name.trim())
  }
  if (typeof body.group === 'string') {
    sets.push('group_name = ?')
    params.push(body.group.trim())
  }
  if (body.tags !== undefined) {
    const rawTags = Array.isArray(body.tags) ? (body.tags as unknown[]) : []
    const tags = rawTags.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean)
    sets.push('tags = ?')
    params.push(JSON.stringify(tags))
  }
  if (typeof body.description === 'string') {
    sets.push('description = ?')
    params.push(body.description)
  }
  if (typeof body.source === 'string') {
    if (!body.source.trim()) {
      res.status(400).json({ message: '接口源内容不能为空' })
      return
    }
    sets.push('source = ?')
    params.push(body.source)
  }
  if (!sets.length) {
    res.status(400).json({ message: '没有可更新的字段' })
    return
  }
  params.push(id)
  const [result] = await getPool().execute(
    `UPDATE documents SET ${sets.join(', ')} WHERE id = ?`,
    params
  )
  if ((result as { affectedRows: number }).affectedRows === 0) {
    res.status(404).json({ message: '文档不存在' })
    return
  }
  res.json({ id })
})

// 删除
docsRouter.delete('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) {
    res.status(400).json({ message: '无效的文档 ID' })
    return
  }
  const [result] = await getPool().execute(`DELETE FROM documents WHERE id = ?`, [id])
  if ((result as { affectedRows: number }).affectedRows === 0) {
    res.status(404).json({ message: '文档不存在' })
    return
  }
  res.json({ id })
})
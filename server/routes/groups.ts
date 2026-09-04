// 分组管理路由：CRUD + 排序；重命名同步 documents.group_name，删除时连带删除组内文档
import { Router, type Request, type Response } from 'express'
import { getPool } from '../db.ts'

export const groupsRouter = Router()

interface GroupRow {
  id: number
  name: string
  sort_order: number
}

// 列表：返回每个分组的名称、排序值、文档计数（按 sort_order, id 排序）
groupsRouter.get('/', async (_req: Request, res: Response) => {
  const [rows] = await getPool().query<GroupRow[]>(
    `SELECT g.id, g.name, g.sort_order,
            (SELECT COUNT(*) FROM documents d WHERE d.group_name = g.name) AS doc_count
     FROM doc_groups g
     ORDER BY g.sort_order ASC, g.id ASC`
  )
  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      sortOrder: r.sort_order,
      docCount: Number((r as unknown as { doc_count: string }).doc_count),
    }))
  )
})

// 新建分组
groupsRouter.post('/', async (req: Request, res: Response) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  if (!name) {
    res.status(400).json({ message: '分组名称不能为空' })
    return
  }
  try {
    const [result] = await getPool().query(
      `INSERT INTO doc_groups (name) VALUES (?)`,
      [name]
    )
    res.status(201).json({
      id: (result as { insertId: number }).insertId,
      name,
      sortOrder: 0,
      docCount: 0,
    })
  } catch (err) {
    if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
      res.status(409).json({ message: `分组 "${name}" 已存在` })
      return
    }
    throw err
  }
})

// 排序：接收 [{id, sortOrder}]，逐条更新（须在 /:id 之前注册，避免被参数路由拦截）
groupsRouter.put('/order', async (req: Request, res: Response) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : []
  const pairs: Array<{ id: number; sortOrder: number }> = []
  for (const it of items) {
    const id = Number(it?.id)
    const sortOrder = Number(it?.sortOrder)
    if (Number.isInteger(id) && Number.isFinite(sortOrder)) {
      pairs.push({ id, sortOrder })
    }
  }
  if (!pairs.length) {
    res.status(400).json({ message: '无效的排序数据' })
    return
  }
  const conn = await getPool().getConnection()
  try {
    await conn.beginTransaction()
    for (const p of pairs) {
      await conn.query(`UPDATE doc_groups SET sort_order = ? WHERE id = ?`, [
        p.sortOrder,
        p.id,
      ])
    }
    await conn.commit()
    res.json({ updated: pairs.length })
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
})

// 重命名分组：同时把归属该组的文档改到新名字
groupsRouter.put('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) {
    res.status(400).json({ message: '无效的分组 ID' })
    return
  }
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  if (!name) {
    res.status(400).json({ message: '分组名称不能为空' })
    return
  }
  const [rows] = await getPool().query<GroupRow[]>(
    `SELECT name FROM doc_groups WHERE id = ?`,
    [id]
  )
  if (!rows.length) {
    res.status(404).json({ message: '分组不存在' })
    return
  }
  const [result] = await getPool().query(`UPDATE doc_groups SET name = ? WHERE id = ?`, [
    name,
    id,
  ])
  if ((result as { affectedRows: number }).affectedRows === 0) {
    res.status(404).json({ message: '分组不存在' })
    return
  }
  // 同步更新归属文档的分组名
  await getPool().query(`UPDATE documents SET group_name = ? WHERE group_name = ?`, [
    name,
    rows[0].name,
  ])
  res.json({ id, name })
})

// 删除分组：连带删除组内文档
groupsRouter.delete('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) {
    res.status(400).json({ message: '无效的分组 ID' })
    return
  }
  const [rows] = await getPool().query<GroupRow[]>(
    `SELECT name FROM doc_groups WHERE id = ?`,
    [id]
  )
  if (!rows.length) {
    res.status(404).json({ message: '分组不存在' })
    return
  }
  const conn = await getPool().getConnection()
  try {
    await conn.beginTransaction()
    await conn.query(`DELETE FROM documents WHERE group_name = ?`, [rows[0].name])
    const [result] = await conn.query(`DELETE FROM doc_groups WHERE id = ?`, [id])
    await conn.commit()
    res.json({ deleted: (result as { affectedRows: number }).affectedRows })
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
})
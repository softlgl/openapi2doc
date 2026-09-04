// 后端入口：初始化数据库 + 提供 /api 接口，生产托管 dist/ 前端
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initDb } from './db.ts'
import { docsRouter } from './routes/docs.ts'
import { groupsRouter } from './routes/groups.ts'
import { config } from './config.ts'

const app = express()
app.use(express.json({ limit: '10mb' }))

app.use('/api/docs', docsRouter)
app.use('/api/groups', groupsRouter)

// 生产模式：托管前端构建产物，非 /api 的 GET 回退到 index.html（支持前端路由刷新）
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dist = path.resolve(__dirname, '../dist')
app.use(express.static(dist))
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.includes('.')) {
    res.sendFile(path.join(dist, 'index.html'))
  } else {
    next()
  }
})

// 统一错误处理：body-parser 等已给出的 4xx 状态透传，其余按 500 处理
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = (err as { status?: number; expose?: boolean }).status
  if (status && status < 500 && (err as { expose?: boolean }).expose) {
    res.status(status).json({ message: err.message })
    return
  }
  console.error(err)
  res.status(500).json({ message: '服务器内部错误' })
})

async function start(): Promise<void> {
  try {
    await initDb()
    app.listen(config.port, () => {
      console.log(`[openapi2doc] 服务已启动: http://localhost:${config.port}`)
      console.log(`[openapi2doc] API:  http://localhost:${config.port}/api/docs`)
    })
  } catch (err) {
    console.error('[openapi2doc] 启动失败，请检查 MySQL 连接与 .env 配置:')
    console.error(err)
    process.exit(1)
  }
}

start()
// MySQL 连接池 + 初始化建库建表
import mysql, { type RowDataPacket } from 'mysql2/promise'
import { config } from './config.ts'

export interface DocRow {
  id: number
  name: string
  group_name: string
  tags: string // JSON 数组字符串
  description: string | null
  source: string
  created_at: Date
  updated_at: Date
}

let pool: ReturnType<typeof mysql.createPool> | null = null

export function getPool(): ReturnType<typeof mysql.createPool> {
  if (!pool) {
    pool = mysql.createPool({
      ...config.mysql,
      waitForConnections: true,
      connectionLimit: 10,
      charset: 'utf8mb4',
    })
  }
  return pool
}

// 启动时确保数据库与表存在
export async function initDb(): Promise<void> {
  const { database, ...conn } = config.mysql
  const admin = await mysql.createConnection({ ...conn })
  await admin.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  )
  await admin.end()

  const pool = getPool()
  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      group_name VARCHAR(100) NOT NULL DEFAULT '',
      tags VARCHAR(2000) NOT NULL DEFAULT '[]',
      description TEXT NULL,
      source LONGTEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  // 分组实体表：让空分组存在、可改名/排序；documents.group_name 为归属引用
  await pool.query(`
    CREATE TABLE IF NOT EXISTS doc_groups (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      UNIQUE KEY uq_doc_groups_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  // 回填：把历史文档里已有的分组名补进 doc_groups
  await pool.query(
    `INSERT IGNORE INTO doc_groups (name)
     SELECT DISTINCT group_name FROM documents WHERE group_name <> ''`
  )
}

// 确保分组名存在于 doc_groups（新编辑或新建分组时调用）
export async function ensureGroup(name: string): Promise<boolean> {
  if (!name || !name.trim()) return true
  await getPool().query(`INSERT IGNORE INTO doc_groups (name) VALUES (?)`, [name.trim()])
  return true
}

export type { RowDataPacket }
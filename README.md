# openapi2doc

将 OpenAPI（Swagger）2.0/3.x 接口定义转换为可在浏览器中阅读、搜索的在线接口文档，并支持导出 HTML 和 Markdown。

## 功能特性

- **OpenAPI 解析**：支持 OpenAPI / Swagger JSON、YAML 格式的导入与在线编辑

- **认证信息**：解析 securitySchemes / securityDefinitions 与全局、操作级 security，在文档概览、接口卡片与导出内容中展示认证方式（apiKey 位置/参数名、HTTP bearer 等）

- **文档管理**：文档的增删改查、按分组树管理、批量移动、按名称搜索

- **在线预览**：接口列表带锚点平滑滚动、可折叠的请求/响应结构、枚举值彩色胶囊展示；预览 iframe 与页面滚动双向同步，内外滚动一致

- **导入体验**：上传/拖拽文件自动填充文档名称；编辑时重新导入替换源码有接口数变化提醒，支持一键撤销

- **导出格式**：HTML 单文件预览、Markdown（请求/响应结构使用表格、$ref 自动展开）

- **部分导出**：可勾选特定接口单独导出（文件名带「（部分导出）」后缀）

- **分组管理**：左侧分组树支持新建、重命名、排序、删除，文档可批量移动分组

## 技术栈

| 层   | 技术                                                    |
| --- | ----------------------------------------------------- |
| 前端  | Vue 3 · Vite · TypeScript · Element Plus · vue-router |
| 后端  | Node.js · Express 5                                   |
| 存储  | MySQL（启动时自动建库建表）                                      |
| 生成器 | 自研 HTML / Markdown 生成器（`src/generators/`）             |

## 目录结构

```
openapi2doc/
├── src/                  # 前端
│   ├── views/            # 页面：DocList / DocEdit / DocView / NotFound
│   ├── components/       # DocPreview（文档预览 iframe 容器）
│   ├── generators/       # html.ts / markdown.ts 导出生成器
│   ├── parser.ts         # OpenAPI 解析
│   ├── api.ts            # 后端 API 封装
│   └── router/           # 前端路由
├── server/               # 后端
│   ├── index.ts          # Express 入口，生产托管 dist/
│   ├── db.ts             # MySQL 连接池 + 建库建表
│   ├── config.ts         # 环境变量配置
│   └── routes/           # docs.ts（文档 CRUD）/ groups.ts（分组）
├── scripts/              # 自测脚本 self-test.mts / verify-real.mts
├── public/               # 静态资源（demo.json）
├── sample-petstore.json  # 示例 OpenAPI 文件
└── start-stop.bat        # Windows 一键启动/停止脚本
```

## 快速开始

### 环境要求

- Node.js 18+

- MySQL 5.7+ / 8.x

### 1. 配置环境变量

复制 `.env.example` 为 `.env` 并填写：

```env
# 后端端口
PORT=3000

# MySQL 连接配置
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=openapi_doc
```

首次启动会自动创建数据库 `openapi_doc` 及 `documents`、`doc_groups` 两张表，无需手动初始化。

### 2. 安装依赖

```bash
npm install
```

### 3. 开发模式

```bash
# 终端 1：后端 API（:3000）
npm run dev:server

# 终端 2：前端（:5173，/api 自动代理到 :3000）
npm run dev
```

### 4. 构建 + 生产运行

```bash
npm run build
npm start        # 单进程托管前端 dist + API，访问 http://localhost:3000/
```

### 5. Windows 一键脚本

```bash
start-stop.bat         # 生产模式：单服务 :3000（若端口被占用会自动停止旧进程）
start-stop.bat dev     # 开发模式：API :3000 + 前端 :5173
```

## 使用流程

1. 打开首页，点击「新建」导入 OpenAPI JSON/YAML 文件（可用 `sample-petstore.json` 体验）
2. 在编辑页可修改名称、分组、标签与文档描述，源码支持在线编辑
3. 在预览页浏览接口详情，勾选接口后使用工具栏按钮导出 HTML / Markdown
4. 在列表页可通过左侧分组树筛选，批量移动文档到指定分组

## 脚本命令

| 命令                   | 说明                   |
| -------------------- | -------------------- |
| `npm run dev`        | 启动 Vite 开发服务器（:5173） |
| `npm run dev:server` | 启动后端 API 服务（:3000）   |
| `npm run build`      | 类型检查 + 生产构建          |
| `npm start`          | 生产模式单服务运行            |
| `npm run test`       | 运行自测脚本               |

## 常见问题

- **启动失败提示 MySQL 连接问题**：确认 MySQL 已启动、`.env` 中账号密码正确，且端口未被占用。

- **前端路由刷新 404**：生产模式已配置回退到 `index.html`，无需额外处理。


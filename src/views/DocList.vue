<template>
  <div class="list-page">
    <!-- 左侧分组导航 -->
    <aside class="sidebar" :class="{ collapsed }">
      <div class="tree-head">
        <template v-if="!collapsed">
          <span class="tree-title">分组</span>
          <div class="head-ops">
            <el-button text size="small" title="新建分组" @click="startAdd">＋ 新建</el-button>
            <el-button text size="small" title="折叠侧栏" @click="collapsed = true">«</el-button>
          </div>
        </template>
        <el-button v-else class="expand-btn" text title="展开分组" @click="collapsed = false">»</el-button>
      </div>

      <template v-if="!collapsed">
        <div v-if="adding" class="new-node" @click.stop>
          <el-input
            v-model="newGroupName"
            size="small"
            placeholder="新分组名称"
            autofocus
            @keyup.enter="addGroup"
            @keydown.esc="adding = false"
          />
          <el-button text size="small" type="primary" :disabled="!newGroupName.trim()" @click="addGroup">新增</el-button>
          <el-button text size="small" @click="adding = false">取消</el-button>
        </div>

        <div class="tree">
          <div class="node all-node" :class="{ active: activeGroup === '' }" @click="selectGroup('')">
            <span class="node-name">全部</span>
            <span class="node-count">{{ totalCount }}</span>
          </div>

          <div
            v-if="ungroupedCount > 0"
            class="node"
            :class="{ active: activeGroup === UNGROUPED }"
            @click="selectGroup(UNGROUPED)"
          >
            <span class="node-name">未分组</span>
            <span class="node-count">{{ ungroupedCount }}</span>
          </div>

          <div
            v-for="(g, idx) in groups"
            :key="g.id"
            class="node group-node"
            :class="{ active: activeGroup === g.name }"
            @click="selectGroup(g.name)"
          >
            <template v-if="renamingId === g.id">
              <el-input
                v-model="renamingName"
                size="small"
                autofocus
                @click.stop
                @keyup.enter="commitRename"
                @keydown.esc="renamingId = null"
              />
              <el-button text size="small" type="primary" @click.stop="commitRename">保存</el-button>
              <el-button text size="small" @click.stop="renamingId = null">取消</el-button>
            </template>
            <template v-else>
              <span class="node-name">{{ g.name }}</span>
              <span class="node-count">{{ g.docCount }}</span>
              <el-dropdown
                class="node-more"
                trigger="click"
                :show-timeout="0"
                :hide-timeout="100"
                @click.stop
                @command="(c: string) => onMenu(c, g, idx)"
              >
                <el-button text size="small" class="more-btn" title="分组选项">⋯</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="rename">修改</el-dropdown-item>
                    <el-dropdown-item command="up" :disabled="idx === 0">上移</el-dropdown-item>
                    <el-dropdown-item command="down" :disabled="idx === groups.length - 1">下移</el-dropdown-item>
                    <el-dropdown-item command="delete" class="danger-item" divided>删除</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
          </div>
        </div>
      </template>
    </aside>

    <!-- 右侧记录区 -->
    <div class="main">
      <div class="toolbar">
        <el-input
          ref="searchRef"
          v-model="query"
          placeholder="按名称搜索…（按 / 聚焦）"
          clearable
          class="search"
          @input="onQueryInput"
        />
        <div class="spacer" />
        <transition name="fade">
          <div v-if="selected.length" class="bulk">
            <span class="sel-info">已选 {{ selected.length }} 项</span>
            <el-dropdown trigger="click" @command="moveSelected">
              <el-button type="warning" plain>移动到分组</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="">未分组</el-dropdown-item>
                  <el-dropdown-item
                    v-for="(g, i) in groups"
                    :key="g.id"
                    :command="g.name"
                    :divided="i === 0"
                  >{{ g.name }}</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button type="danger" plain @click="removeSelected">批量删除</el-button>
          </div>
        </transition>
        <el-button type="primary" @click="$router.push('/new')">+ 新建文档</el-button>
      </div>

      <div class="table-wrap">
        <el-table
          :data="docs"
          v-loading="loading"
          class="docs-table"
          :default-sort="{ prop: 'updatedAt', order: 'descending' }"
          @row-click="onRowClick"
          @selection-change="selected = $event"
        >
          <el-table-column type="selection" width="46" />
          <el-table-column prop="name" label="名称" min-width="220" sortable>
            <template #default="{ row }">
              <div class="cell-name">
                <span class="doc-name">{{ row.name }}</span>
                <span v-if="row.description" class="doc-desc" :title="row.description">{{ row.description }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="group" label="分组" width="130">
            <template #default="{ row }">
              <el-tag v-if="row.group" size="small" type="info" effect="plain">{{ row.group }}</el-tag>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="标签" min-width="150">
            <template #default="{ row }">
              <el-tag
                v-for="t in row.tags.slice(0, 3)"
                :key="t"
                size="small"
                class="tag"
                type="primary"
                effect="light"
              >{{ t }}</el-tag>
              <span v-if="row.tags.length > 3" class="tag-more">+{{ row.tags.length - 3 }}</span>
              <span v-if="!row.tags.length" class="muted">—</span>
            </template>
          </el-table-column>
          <el-table-column prop="updatedAt" label="更新时间" width="160" sortable>
            <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="160" align="right">
            <template #default="{ row }">
              <div class="ops">
                <el-button size="small" text type="primary" @click.stop="openView(row)">查看</el-button>
                <el-button size="small" text type="warning" @click.stop="$router.push(`/doc/${row.id}/edit`)">编辑</el-button>
                <el-button size="small" text type="danger" class="danger-op" @click.stop="removeDoc(row)">删除</el-button>
              </div>
            </template>
          </el-table-column>
          <template #empty>
            <div class="empty">
              <template v-if="hasFilter">
                <p class="empty-title">没有匹配的文档</p>
                <el-button text type="primary" @click="clearFilters">清除筛选条件</el-button>
              </template>
              <template v-else>
                <p class="empty-title">暂无接口文档</p>
                <el-button type="primary" plain @click="$router.push('/new')">新建第一篇文档</el-button>
              </template>
            </div>
          </template>
        </el-table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type InputInstance } from 'element-plus'
import {
  listDocs,
  listGroups,
  createGroup,
  renameGroup,
  deleteGroup,
  reorderGroups,
  bulkMove,
  bulkDelete,
  deleteDoc,
  type DocMeta,
  type GroupMeta,
} from '../api'

// 未分组在本地用哨兵值表示（后端空字符串表示“不过滤”，无法单独查询）
const UNGROUPED = '__ungrouped__'

const router = useRouter()
const docs = ref<DocMeta[]>([])
const groups = ref<GroupMeta[]>([])
const activeGroup = ref('')
const query = ref('')
const loading = ref(false)
const selected = ref<DocMeta[]>([])

const totalCount = ref(0)
const ungroupedCount = ref(0)

const collapsed = ref(false)
const adding = ref(false)
const newGroupName = ref('')
const renamingId = ref<number | null>(null)
const renamingName = ref('')
const searchRef = ref<InputInstance | null>(null)

const hasFilter = computed(() => !!query.value.trim() || activeGroup.value !== '')

// 请求序号：丢弃过期响应，避免快速输入时结果乱序
let seqId = 0
let searchTimer: number | undefined

function formatTime(s: string): string {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

async function load(): Promise<void> {
  const seq = ++seqId
  const isUngrouped = activeGroup.value === UNGROUPED
  const q = query.value.trim() || undefined
  loading.value = true
  try {
    let list: DocMeta[]
    let all: DocMeta[]
    if (isUngrouped || q) {
      // 需要统计信息时额外取一次全量（列表接口不含 source，开销很小）
      ;[list, all] = await Promise.all([
        listDocs({ group: isUngrouped ? undefined : activeGroup.value || undefined, q }),
        listDocs(),
      ])
    } else {
      all = await listDocs()
      list = all
    }
    if (seq !== seqId) return
    if (isUngrouped) list = list.filter((d) => !d.group)
    docs.value = list
    totalCount.value = all.length
    ungroupedCount.value = all.filter((d) => !d.group).length
  } catch (e) {
    if (seq === seqId) ElMessage.error((e as Error).message)
  } finally {
    if (seq === seqId) loading.value = false
  }
}

function onQueryInput(): void {
  if (searchTimer) window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(load, 300)
}

function clearFilters(): void {
  query.value = ''
  activeGroup.value = ''
  load()
}

async function loadGroups(): Promise<void> {
  try {
    groups.value = await listGroups()
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

function selectGroup(name: string): void {
  if (activeGroup.value === name) return
  activeGroup.value = name
  load()
}

function openView(row: DocMeta): void {
  router.push(`/doc/${row.id}`)
}

// 勾选框的点击不应触发整行跳转
function onRowClick(row: DocMeta, column?: { type?: string }): void {
  if (column?.type === 'selection' || column?.type === 'operation') return
  openView(row)
}

async function removeDoc(row: DocMeta): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除文档「${row.name}」吗？此操作不可恢复。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await deleteDoc(row.id)
    ElMessage.success('已删除')
    await refreshAll()
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

async function moveSelected(group: string): Promise<void> {
  const ids = selected.value.map((d) => d.id)
  if (!ids.length) return
  try {
    await bulkMove(ids, group)
    ElMessage.success(group ? `已移动到「${group}」` : '已移出分组')
    selected.value = []
    await refreshAll()
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

async function removeSelected(): Promise<void> {
  const ids = selected.value.map((d) => d.id)
  if (!ids.length) return
  try {
    await ElMessageBox.confirm(`确定删除选中的 ${ids.length} 篇文档吗？此操作不可恢复。`, '批量删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await bulkDelete(ids)
    ElMessage.success('已删除')
    selected.value = []
    await refreshAll()
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

// 列表与分组计数一起刷新，保证侧栏数字不滞后
async function refreshAll(): Promise<void> {
  await Promise.all([load(), loadGroups()])
}

// ---- 分组就地管理 ----
function onMenu(cmd: string, g: GroupMeta, idx: number): void {
  switch (cmd) {
    case 'add': startAdd(); break
    case 'rename': startRename(g); break
    case 'up': moveGroup(idx, -1); break
    case 'down': moveGroup(idx, 1); break
    case 'delete': removeGroup(g); break
  }
}

function startAdd(): void {
  adding.value = true
  newGroupName.value = ''
}

async function addGroup(): Promise<void> {
  const name = newGroupName.value.trim()
  if (!name) return
  try {
    await createGroup(name)
    newGroupName.value = ''
    adding.value = false
    await loadGroups()
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

function startRename(g: GroupMeta): void {
  renamingId.value = g.id
  renamingName.value = g.name
}

async function commitRename(): Promise<void> {
  if (renamingId.value === null) return
  const name = renamingName.value.trim()
  if (!name) {
    ElMessage.warning('名称不能为空')
    return
  }
  try {
    await renameGroup(renamingId.value, name)
    renamingId.value = null
    if (activeGroup.value && activeGroup.value !== UNGROUPED) activeGroup.value = name
    await refreshAll()
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

async function removeGroup(g: GroupMeta): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `删除分组「${g.name}」将同时删除其中 ${g.docCount} 篇文档，确定继续吗？`,
      '删除分组',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  try {
    await deleteGroup(g.id)
    if (activeGroup.value === g.name) activeGroup.value = ''
    await refreshAll()
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

async function moveGroup(idx: number, dir: number): Promise<void> {
  const target = idx + dir
  if (target < 0 || target >= groups.value.length) return
  const arr = [...groups.value]
  const [moved] = arr.splice(idx, 1)
  arr.splice(target, 0, moved)
  try {
    await reorderGroups(arr.map((g, i) => ({ id: g.id, sortOrder: i })))
    groups.value = arr
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

// ---- 快捷键：/ 聚焦搜索 ----
function onKeydown(e: KeyboardEvent): void {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
  const t = e.target as HTMLElement | null
  const tag = t?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return
  e.preventDefault()
  searchRef.value?.focus()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  void load()
  void loadGroups()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (searchTimer) window.clearTimeout(searchTimer)
})
</script>

<style scoped>
.list-page { display: flex; gap: 20px; align-items: flex-start; }

.sidebar {
  width: 210px;
  flex: 0 0 210px;
  position: sticky;
  top: 72px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  max-height: calc(100vh - 104px);
  overflow: hidden;
  transition: width .18s ease, padding .18s ease, flex-basis .18s ease;
}
.sidebar.collapsed { width: 40px; flex-basis: 40px; padding: 6px; }

.tree-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 6px 8px;
  font-size: 12px;
  color: var(--text-3);
  letter-spacing: .5px;
  flex: 0 0 auto;
}
.head-ops { display: flex; align-items: center; gap: 2px; }
.expand-btn { width: 100%; }

.tree { overflow: auto; flex: 1; min-height: 0; }

.node {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text);
  margin-bottom: 2px;
  transition: background .12s, color .12s;
}
.node:hover { background: var(--surface-3); }
.node.active { background: var(--brand-weak); color: var(--brand); font-weight: 600; }
.node-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.node-count {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-3);
  background: var(--surface-3);
  border-radius: 10px;
  padding: 0 8px;
}
.node.active .node-count { color: var(--brand); background: var(--surface); }
.node-more { flex-shrink: 0; }
.more-btn { color: var(--text-3); padding: 0 4px; opacity: .5; transition: opacity .12s, color .12s; }
.node:hover .more-btn, .more-btn:hover { opacity: 1; }
.more-btn:hover { color: var(--text); }

.new-node { display: flex; gap: 4px; align-items: center; padding: 4px 2px 8px; flex: 0 0 auto; }
.new-node :deep(.el-input) { flex: 1; }

.main { flex: 1; min-width: 0; }
.toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
.search { width: 260px; }
.spacer { flex: 1; }
.bulk { display: flex; align-items: center; gap: 10px; }
.sel-info { color: var(--text-2); font-size: 13px; }
.fade-enter-active, .fade-leave-active { transition: opacity .15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.table-wrap {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}
.docs-table :deep(.el-table__row) { cursor: pointer; }

.cell-name { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.doc-name { font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.doc-desc {
  color: var(--text-3);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag { margin-right: 6px; }
.tag-more { font-size: 12px; color: var(--text-3); }
.muted { color: var(--text-3); }

.ops { display: flex; align-items: center; justify-content: flex-end; gap: 0; }
/* 删除按钮默认隐藏，行内 hover / 聚焦时显现，降低误触 */
.danger-op { opacity: 0; transition: opacity .12s; }
.docs-table :deep(.el-table__row:hover) .danger-op,
.docs-table :deep(.el-table__row:focus-within) .danger-op { opacity: 1; }

.empty { padding: 28px 0; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.empty-title { margin: 0; color: var(--text-3); font-size: 14px; }

@media (max-width: 900px) {
  .list-page { flex-direction: column; gap: 14px; }
  .sidebar {
    position: static;
    width: 100%;
    flex: none;
    max-height: none;
  }
  .sidebar.collapsed { width: 100%; flex: none; }
  .tree { overflow: visible; display: flex; flex-wrap: wrap; gap: 6px; }
  .node { margin-bottom: 0; width: auto; }
  .search { width: 100%; }
}
</style>

<style>
/* 分组“⋯”菜单中的删除项：红色警示（弹层 teleport 到 body，需全局样式） */
.danger-item { color: #f56c6c; }
.danger-item:hover { color: #f56c6c; }
</style>

<template>
  <div class="view-page">
    <div class="topbar">
      <el-button text @click="$router.push('/')">← 返回列表</el-button>
      <div class="spacer" />
      <el-button size="small" type="warning" plain @click="$router.push(`/doc/${id}/edit`)">编辑</el-button>
      <el-dropdown trigger="click" @command="onExport">
        <el-button size="small">导出 ▾</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="md">下载 Markdown</el-dropdown-item>
            <el-dropdown-item command="html">下载 HTML</el-dropdown-item>
            <el-dropdown-item command="window" divided>新窗口打开</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button size="small" type="danger" plain @click="removeDoc">删除</el-button>
    </div>

    <el-alert
      v-if="error"
      :title="error"
      type="error"
      show-icon
      :closable="false"
      class="err"
    />

    <el-card shadow="never" class="meta-card">
      <template #header>
        <div class="card-head">
          <span class="title">
            {{ docDetail?.name || doc?.title }}
            <el-tag size="small" class="ver">{{ verLabel(doc?.version) }}</el-tag>
            <el-tag v-if="docDetail?.group" size="small" type="info" effect="plain" class="ver">{{ docDetail.group }}</el-tag>
          </span>
        </div>
      </template>
      <div class="body-preview">
        <transition name="fade">
          <div v-if="selectedCount > 0" class="sel-bar">
            <span class="sel-count">已选 {{ selectedCount }} 个接口</span>
            <el-button size="small" text @click="clearSel">清空</el-button>
            <div class="sel-flex" />
            <el-button size="small" type="primary" plain @click="exportSelected('md')">导出所选 Markdown</el-button>
            <el-button size="small" type="primary" plain @click="exportSelected('html')">导出所选 HTML</el-button>
          </div>
        </transition>
        <DocPreview :id="docId" class="preview-fill" @loaded="onLoaded" @error="(m) => (error = m)" @toggle="onToggle" />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import DocPreview from '../components/DocPreview.vue'
import { generateMarkdown } from '../generators/markdown'
import { generateHtml, download, buildHtmlFile } from '../generators/html'
import { deleteDoc, type DocDetail } from '../api'
import type { ApiDocument } from '../types'

const SITE = 'OpenAPI 接口文档管理'

const props = defineProps<{ id: string }>()
const router = useRouter()

const docId = computed(() => Number(props.id))
const doc = ref<ApiDocument | null>(null)
const docDetail = ref<DocDetail | null>(null)
const error = ref('')
const selected = ref<Set<string>>(new Set())
const selectedCount = computed(() => selected.value.size)

// 全屏预览用的 blob URL，仅保留最近一个并在卸载时释放
let previewUrl: string | null = null

function onLoaded(d: ApiDocument, detail: DocDetail): void {
  doc.value = d
  docDetail.value = detail
  selected.value = new Set() // 换文档后清空已选
  document.title = `${detail.name} · ${SITE}`
}

function onToggle(id: string, checked: boolean): void {
  if (checked) selected.value.add(id)
  else selected.value.delete(id)
}

function clearSel(): void {
  selected.value = new Set()
}

// 按已选接口构造子文档：过滤 operations（保持原顺序），schemas 保留以保引用完整
function subsetDoc(): ApiDocument | null {
  if (!doc.value || selected.value.size === 0) return null
  return {
    ...doc.value,
    title: `${doc.value.title || '接口文档'}（部分导出）`,
    operations: doc.value.operations.filter((op) => selected.value.has(op.id)),
  }
}

function exportSelected(fmt: 'md' | 'html'): void {
  const sub = subsetDoc()
  if (!sub) return
  const blob =
    fmt === 'md'
      ? new Blob([generateMarkdown(sub)], { type: 'text/markdown;charset=utf-8' })
      : buildHtmlFile(sub)
  download(blob, safeName(sub, fmt))
}

function verLabel(v?: string): string {
  const s = v || ''
  return s.startsWith('v') || s.startsWith('V') ? s : `v${s}`
}

function safeName(d: ApiDocument, ext: string): string {
  const base = (d.title || docDetail.value?.name || 'api').replace(/[\\/:*?"<>|\s]+/g, '_')
  return `${base}.${ext}`
}

function downloadMarkdown(): void {
  if (!doc.value) return
  download(new Blob([generateMarkdown(doc.value)], { type: 'text/markdown;charset=utf-8' }), safeName(doc.value, 'md'))
}

function downloadHtml(): void {
  if (!doc.value) return
  download(new Blob([generateHtml(doc.value)], { type: 'text/html;charset=utf-8' }), safeName(doc.value, 'html'))
}

function openFullscreen(): void {
  if (!doc.value) return
  if (previewUrl) URL.revokeObjectURL(previewUrl)
  previewUrl = URL.createObjectURL(buildHtmlFile(doc.value))
  const win = window.open(previewUrl, '_blank')
  if (!win) {
    ElMessage.warning('新窗口被浏览器拦截，请允许弹出窗口后重试')
    URL.revokeObjectURL(previewUrl)
    previewUrl = null
  }
}

function onExport(cmd: string): void {
  if (!doc.value) return
  if (cmd === 'md') downloadMarkdown()
  else if (cmd === 'html') downloadHtml()
  else if (cmd === 'window') openFullscreen()
}

async function removeDoc(): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除文档「${docDetail.value?.name}」吗？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await deleteDoc(docId.value)
    ElMessage.success('已删除')
    router.push('/')
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

onBeforeUnmount(() => {
  if (previewUrl) URL.revokeObjectURL(previewUrl)
})
</script>

<style scoped>
/* 撑满主区域：高度由 flex 链推导，不再依赖魔法数字 */
.view-page { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.topbar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.spacer { flex: 1; }
.err { margin-bottom: 12px; }

/* min-height 兜底：窗口很矮时预览区仍保有可用高度 */
.meta-card { flex: 1; min-height: 320px; display: flex; flex-direction: column; }
.meta-card :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 12px;
}
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.card-head .title { font-weight: 700; font-size: 16px; color: var(--text); }
.ver { margin-left: 8px; }

.body-preview { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.preview-fill { flex: 1; min-height: 0; }

.sel-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  margin-bottom: 10px;
  background: var(--brand-weak);
  border: 1px solid var(--brand-line);
  border-radius: 8px;
  flex-wrap: wrap;
}
.sel-count { font-size: 13px; font-weight: 600; color: var(--brand); }
.sel-flex { flex: 1; }
.fade-enter-active, .fade-leave-active { transition: opacity .15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>

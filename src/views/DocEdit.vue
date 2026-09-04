<template>
  <div class="edit-page">
    <div class="topbar">
      <el-button text @click="goBack">← 返回</el-button>
      <span class="mode">{{ isEdit ? '编辑文档' : '新建文档' }}</span>
      <span v-if="dirty" class="dirty-dot" title="有未保存的修改">● 未保存</span>
      <div class="spacer" />
      <span v-if="draftSavedAt" class="draft-tip">草稿已自动保存 {{ draftSavedAt }}</span>
    </div>

    <el-card shadow="never" class="form-card">
      <el-form label-position="top">
        <div class="grid">
          <el-form-item label="文档名称（必填）" class="col">
            <el-input v-model="form.name" placeholder="例如：订单服务 API" maxlength="120" show-word-limit />
          </el-form-item>
          <el-form-item label="分组" class="col">
            <el-select
              v-model="form.group"
              placeholder="选择或输入新分组"
              filterable
              allow-create
              clearable
            >
              <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.name" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="标签（多个用逗号分隔）">
          <el-input v-model="form.tagsText" placeholder="例如：v1, 内网, 支付" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="文档用途 / 说明" />
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="form-card source-card">
      <template #header>
        <div class="card-head">
          <span>接口源内容（swagger.json / swagger.yaml / openapi.json）</span>
          <div class="head-ops">
            <template v-if="fileName">
              <span class="file-name" :title="fileName">{{ fileName }}</span>
              <el-button size="small" text @click="clearSource">清除</el-button>
            </template>
            <el-button size="small" :disabled="!form.source.trim()" @click="formatSource">格式化</el-button>
            <el-upload
              accept=".json,.yaml,.yml,application/json"
              :show-file-list="false"
              :auto-upload="false"
              :on-change="onFileChange"
            >
              <el-button size="small" plain>上传文件</el-button>
            </el-upload>
            <el-button size="small" text type="primary" :loading="checking" @click="checkSource()">校验</el-button>
          </div>
        </div>
      </template>

      <div
        class="editor"
        :class="{ over: dragOver, fullscreen }"
        @dragover.prevent="dragOver = true"
        @dragleave.prevent="dragOver = false"
        @drop.prevent="onDrop"
      >
        <div class="editor-bar">
          <span class="src-stat">{{ sourceStat }}</span>
          <div class="spacer" />
          <el-button size="small" text @click="fullscreen = !fullscreen">
            {{ fullscreen ? '退出全屏 (Esc)' : '全屏编辑' }}
          </el-button>
        </div>
        <el-input
          v-model="form.source"
          type="textarea"
          resize="vertical"
          spellcheck="false"
          :input-style="editorStyle"
          placeholder="在此粘贴接口定义内容，或将文件拖拽到此区域…"
        />
        <div v-if="!form.source" class="drop-hint">支持拖拽 .json / .yaml 文件到此处</div>
      </div>

      <el-alert
        v-if="checkResult"
        :title="checkResult.ok ? `校验通过：${checkResult.count} 个接口，${checkResult.schemas} 个数据结构` : `校验失败：${checkResult.error}`"
        :type="checkResult.ok ? 'success' : 'error'"
        show-icon
        :closable="false"
        class="check-alert"
      />
    </el-card>

    <div class="actions">
      <el-tooltip :disabled="canSave" content="请先填写文档名称与接口源内容" placement="top">
        <span>
          <el-button type="primary" :disabled="!canSave" :loading="saving" @click="save">保存</el-button>
        </span>
      </el-tooltip>
      <el-button @click="goBack">取消</el-button>
      <span class="save-hint">Ctrl / ⌘ + S 保存</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadFile } from 'element-plus'
import yaml from 'js-yaml'
import { parseOpenApi } from '../parser'
import { listGroups, getDoc, createDoc, updateDoc, type GroupMeta } from '../api'

const props = defineProps<{ id?: string }>()
const router = useRouter()

const isEdit = computed(() => !!props.id)
const id = computed(() => (props.id ? Number(props.id) : undefined))

const form = reactive({
  name: '',
  group: '',
  tagsText: '',
  description: '',
  source: '',
})
const groups = ref<GroupMeta[]>([])
const fileName = ref('')
const dragOver = ref(false)
const checking = ref(false)
const saving = ref(false)
const fullscreen = ref(false)
const dirty = ref(false)
const ready = ref(false)
const draftSavedAt = ref('')
const checkResult = ref<{ ok: boolean; count?: number; schemas?: number; error?: string } | null>(null)

const canSave = computed(() => !!form.name.trim() && !!form.source.trim())
const sourceStat = computed(() => {
  const s = form.source
  if (!s) return '空'
  const lines = s.split('\n').length
  return `${lines} 行 · ${(s.length / 1024).toFixed(1)} KB`
})
const editorStyle = computed(() => ({
  height: fullscreen.value ? '100%' : '340px',
  fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
  fontSize: '13px',
  lineHeight: '1.6',
}))

const draftKey = computed(() => `o2d-draft-${isEdit.value ? id.value : 'new'}`)

// ---- 草稿：输入后自动落盘，刷新/误关不丢内容 ----
let draftTimer: number | undefined
function scheduleDraft(): void {
  if (draftTimer) window.clearTimeout(draftTimer)
  draftTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(draftKey.value, JSON.stringify(form))
      draftSavedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    } catch {
      /* 配额不足或隐私模式，忽略 */
    }
  }, 600)
}
function clearDraft(): void {
  try {
    localStorage.removeItem(draftKey.value)
  } catch {
    /* ignore */
  }
  draftSavedAt.value = ''
}

async function tryRestoreDraft(): Promise<void> {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(draftKey.value)
  } catch {
    return
  }
  if (!raw) return
  let saved: Record<string, unknown>
  try {
    saved = JSON.parse(raw)
  } catch {
    clearDraft()
    return
  }
  const same =
    saved.name === form.name &&
    saved.group === form.group &&
    saved.tagsText === form.tagsText &&
    saved.description === form.description &&
    saved.source === form.source
  if (same) {
    clearDraft()
    return
  }
  try {
    await ElMessageBox.confirm('检测到上次未保存的内容，是否恢复继续编辑？', '恢复草稿', {
      type: 'warning',
      confirmButtonText: '恢复',
      cancelButtonText: '丢弃草稿',
    })
  } catch {
    clearDraft()
    return
  }
  Object.assign(form, {
    name: typeof saved.name === 'string' ? saved.name : form.name,
    group: typeof saved.group === 'string' ? saved.group : form.group,
    tagsText: typeof saved.tagsText === 'string' ? saved.tagsText : form.tagsText,
    description: typeof saved.description === 'string' ? saved.description : form.description,
    source: typeof saved.source === 'string' ? saved.source : form.source,
  })
  dirty.value = true
  autoCheck()
}

watch(form, () => {
  if (!ready.value) return
  dirty.value = true
  scheduleDraft()
})

// ---- 源内容装载 ----
function loadFile(raw: File): void {
  fileName.value = raw.name
  const reader = new FileReader()
  reader.onload = () => {
    form.source = String(reader.result || '')
    checkResult.value = null
    autoCheck()
  }
  reader.readAsText(raw)
}

function onFileChange(file: UploadFile): void {
  if (file.raw) loadFile(file.raw)
}

function onDrop(e: DragEvent): void {
  dragOver.value = false
  const raw = e.dataTransfer?.files?.[0]
  if (raw) loadFile(raw)
}

function clearSource(): void {
  form.source = ''
  fileName.value = ''
  checkResult.value = null
}

// ---- 校验 ----
function runCheck(): boolean {
  const result = parseOpenApi(form.source)
  if (!result.ok) {
    checkResult.value = { ok: false, error: result.error }
    return false
  }
  checkResult.value = { ok: true, count: result.doc.operations.length, schemas: result.doc.schemas.length }
  return true
}

function checkSource(): void {
  if (!form.source.trim()) {
    ElMessage.warning('请先粘贴或上传接口源内容')
    return
  }
  checking.value = true
  const ok = runCheck()
  checking.value = false
  if (ok) ElMessage.success('校验通过')
}

let checkTimer: number | undefined
// 自动校验只提示成功，避免粘贴过程中被红条打扰；错误留给用户主动点“校验”
function autoCheck(): void {
  if (checkTimer) window.clearTimeout(checkTimer)
  checkTimer = window.setTimeout(() => {
    if (!form.source.trim()) {
      checkResult.value = null
      return
    }
    const result = parseOpenApi(form.source)
    checkResult.value = result.ok
      ? { ok: true, count: result.doc.operations.length, schemas: result.doc.schemas.length }
      : null
  }, 800)
}

watch(() => form.source, autoCheck)

// ---- 格式化 ----
function formatSource(): void {
  const src = form.source
  if (!src.trim()) return
  try {
    const trimmed = src.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      form.source = JSON.stringify(JSON.parse(src), null, 2)
    } else {
      form.source = yaml.dump(yaml.load(src), { indent: 2, lineWidth: 120, noRefs: true })
    }
    ElMessage.success('已格式化')
    autoCheck()
  } catch (e) {
    ElMessage.error(`格式化失败：${(e as Error).message}`)
  }
}

// ---- 保存 ----
async function save(): Promise<void> {
  if (!canSave.value) return
  // 保存前兜底校验，避免把无法解析的源内容写进库
  const parsed = parseOpenApi(form.source)
  if (!parsed.ok) {
    try {
      await ElMessageBox.confirm(parsed.error, '源内容解析失败', {
        type: 'warning',
        confirmButtonText: '仍要保存',
        cancelButtonText: '返回修改',
      })
    } catch {
      checkResult.value = { ok: false, error: parsed.error }
      return
    }
  }
  saving.value = true
  const tags = form.tagsText.split(/[,，]/).map((t) => t.trim()).filter(Boolean)
  const payload = {
    name: form.name.trim(),
    group: form.group.trim(),
    tags,
    description: form.description,
    source: form.source,
  }
  try {
    const saved = id.value !== undefined
      ? await updateDoc(id.value, payload)
      : await createDoc(payload)
    dirty.value = false
    clearDraft()
    ElMessage.success(isEdit.value ? '已更新' : '已保存')
    router.push(`/doc/${id.value ?? saved.id}`)
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    saving.value = false
  }
}

// 只负责跳转，未保存的拦截统一交给 onBeforeRouteLeave，避免弹两次确认
function goBack(): void {
  if (window.history.length > 1) router.back()
  else router.push('/')
}

onBeforeRouteLeave(async () => {
  if (!dirty.value) return true
  try {
    await ElMessageBox.confirm('有未保存的修改，离开后这些内容将会丢失（草稿仍会保留）。', '未保存', {
      type: 'warning',
      confirmButtonText: '放弃并离开',
      cancelButtonText: '留在页面',
    })
    return true
  } catch {
    return false
  }
})

function onBeforeUnload(e: BeforeUnloadEvent): void {
  if (!dirty.value) return
  e.preventDefault()
  e.returnValue = ''
}

function onKeydown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    if (canSave.value && !saving.value) void save()
    return
  }
  if (e.key === 'Escape' && fullscreen.value) fullscreen.value = false
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', onBeforeUnload)
  try {
    groups.value = await listGroups()
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
  if (id.value !== undefined) {
    try {
      const detail = await getDoc(id.value)
      Object.assign(form, {
        name: detail.name,
        group: detail.group,
        tagsText: detail.tags.join(', '),
        description: detail.description || '',
        source: detail.source,
      })
    } catch (e) {
      ElMessage.error((e as Error).message)
    }
  }
  ready.value = true
  await tryRestoreDraft()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('beforeunload', onBeforeUnload)
  if (draftTimer) window.clearTimeout(draftTimer)
  if (checkTimer) window.clearTimeout(checkTimer)
})
</script>

<style scoped>
.edit-page { max-width: 1100px; }
.topbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.mode { font-weight: 700; font-size: 16px; color: var(--text); }
.spacer { flex: 1; }
.dirty-dot { font-size: 12px; color: var(--warn); }
.draft-tip { font-size: 12px; color: var(--text-3); }

.form-card { margin-bottom: 16px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.head-ops { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.file-name {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text-2);
}

.editor {
  position: relative;
  border: 1.5px dashed transparent;
  border-radius: 8px;
  padding: 6px;
  transition: border-color .15s, background .15s;
}
.editor.over { border-color: var(--brand); background: var(--brand-weak); }
.editor-bar { display: flex; align-items: center; gap: 8px; padding: 0 2px 6px; }
.src-stat { font-size: 12px; color: var(--text-3); }
.drop-hint {
  position: absolute;
  left: 50%;
  top: 60%;
  transform: translate(-50%, -50%);
  font-size: 13px;
  color: var(--text-3);
  pointer-events: none;
}

.editor.fullscreen {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: var(--bg);
  border: none;
  border-radius: 0;
  padding: 16px;
  display: flex;
  flex-direction: column;
}
.editor.fullscreen :deep(.el-textarea) { flex: 1; min-height: 0; }
.editor.fullscreen :deep(.el-textarea__inner) { height: 100% !important; }
.editor.fullscreen .drop-hint { display: none; }

.check-alert { margin-top: 12px; }
.actions { display: flex; align-items: center; gap: 10px; margin-top: 16px; }
.save-hint { font-size: 12px; color: var(--text-3); }

@media (max-width: 720px) {
  .grid { grid-template-columns: 1fr; }
}
</style>

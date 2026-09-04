<template>
  <div v-loading="loading" class="doc-preview">
    <template v-if="doc">
      <div class="preview-meta">
        <span>共 {{ doc.operations.length }} 个接口</span>
        <code v-if="doc.serverUrl">{{ doc.serverUrl }}</code>
      </div>
      <iframe
        ref="frameRef"
        :srcdoc="htmlPreview"
        class="preview"
        title="预览"
        sandbox="allow-scripts allow-same-origin"
        @load="onFrameLoad"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { parseOpenApi } from '../parser'
import { generateHtml, type ThemeMode } from '../generators/html'
import { getDoc, type DocDetail } from '../api'
import { theme } from '../composables/useTheme'
import type { ApiDocument } from '../types'

const props = defineProps<{ id: number }>()
const emit = defineEmits<{
  (e: 'loaded', doc: ApiDocument, detail: DocDetail): void
  (e: 'error', message: string): void
  (e: 'toggle', id: string, checked: boolean): void
}>()

const doc = ref<ApiDocument | null>(null)
const loading = ref(false)
const frameRef = ref<HTMLIFrameElement | null>(null)

// 初始主题在生成 HTML 时快照，之后通过消息同步，避免切换主题导致 iframe 重载
const initialTheme = ref<ThemeMode>(theme.value)

const htmlPreview = computed(() =>
  doc.value ? generateHtml(doc.value, { selection: true, theme: initialTheme.value }) : ''
)

function postTheme(mode: ThemeMode): void {
  try {
    frameRef.value?.contentWindow?.postMessage({ type: 'o2d-theme', value: mode }, '*')
  } catch {
    /* 跨源或尚未就绪时忽略 */
  }
}

// 接收 iframe 消息：接口勾选 + 主题反向同步
function onMessage(e: MessageEvent): void {
  const d = e.data
  if (!d || typeof d !== 'object') return
  if (d.type === 'o2d-select') {
    emit('toggle', String(d.id), !!d.checked)
  } else if (d.type === 'o2d-theme' && (d.value === 'dark' || d.value === 'light')) {
    theme.value = d.value
  }
}

// iframe 每次加载完成后补发一次，覆盖“切换主题时文档尚未就绪”的情况
function onFrameLoad(): void {
  postTheme(theme.value)
}

watch(theme, (mode) => postTheme(mode))

async function load(): Promise<void> {
  loading.value = true
  doc.value = null
  try {
    const detail = await getDoc(props.id)
    const result = parseOpenApi(detail.source)
    if (!result.ok) {
      emit('error', result.error)
      return
    }
    initialTheme.value = theme.value
    doc.value = result.doc
    emit('loaded', result.doc, detail)
  } catch (e) {
    emit('error', (e as Error).message)
  } finally {
    loading.value = false
  }
}

onMounted(() => window.addEventListener('message', onMessage))
onBeforeUnmount(() => window.removeEventListener('message', onMessage))

watch(() => props.id, () => void load())
void load()
</script>

<style scoped>
.doc-preview {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}
.preview-meta {
  flex-shrink: 0;
  margin-bottom: 12px;
  color: var(--text-2);
  font-size: 13px;
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
}
.preview-meta code {
  background: var(--surface-3);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}
.preview {
  flex: 1;
  min-height: 0;
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}
</style>

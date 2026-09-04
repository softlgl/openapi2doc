import { ref, watch } from 'vue'

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'o2d-theme'
const root = document.documentElement
const media = window.matchMedia('(prefers-color-scheme: dark)')

function readSaved(): ThemeMode | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

function apply(mode: ThemeMode): void {
  root.classList.toggle('dark', mode === 'dark')
  root.style.colorScheme = mode
}

// 未手动设置过时跟随系统，设置过则以用户选择为准
export const theme = ref<ThemeMode>(readSaved() ?? (media.matches ? 'dark' : 'light'))

apply(theme.value)

watch(theme, (mode) => {
  apply(mode)
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    /* 隐私模式下写入失败可忽略 */
  }
})

media.addEventListener('change', (e) => {
  if (readSaved()) return
  theme.value = e.matches ? 'dark' : 'light'
})

export function toggleTheme(): void {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
}

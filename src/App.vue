<template>
  <el-container class="app">
    <el-header class="header">
      <div class="brand">
        <span class="logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M9 13h6M9 17h4" />
          </svg>
        </span>
        <router-link to="/" class="brand-link">OpenAPI 接口文档管理</router-link>
        <span class="hint">上传解析 · 持久保存 · 多格式导出</span>
      </div>

      <nav class="nav">
        <router-link to="/" class="nav-link" active-class="active">文档列表</router-link>
        <router-link to="/new" class="nav-link">新建文档</router-link>
        <button
          class="icon-btn"
          :title="theme === 'dark' ? '切换为亮色' : '切换为暗色'"
          :aria-label="theme === 'dark' ? '切换为亮色' : '切换为暗色'"
          @click="toggleTheme"
        >
          <svg v-if="theme === 'dark'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          </svg>
        </button>
      </nav>
    </el-header>

    <el-main class="body">
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
import { theme, toggleTheme } from './composables/useTheme'
</script>

<style scoped>
.app {
  min-height: 100vh;
  width: 100%;
  flex-direction: column;
}

.body {
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  --el-main-padding: 16px 20px;
}

.header {
  position: sticky;
  top: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  height: 56px;
  padding: 0 20px;
  background: var(--header-bg);
  color: var(--header-fg);
  box-shadow: var(--shadow-sm);
}

.brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
.logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--brand);
  color: #fff;
  flex: 0 0 auto;
}
.brand-link {
  font-size: 16px;
  font-weight: 600;
  color: var(--header-fg);
  text-decoration: none;
  white-space: nowrap;
}
.hint {
  font-size: 12px;
  color: var(--header-fg-2);
  padding-left: 10px;
  border-left: 1px solid var(--header-active);
  white-space: nowrap;
}

.nav { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
.nav-link {
  color: var(--header-fg-2);
  text-decoration: none;
  font-size: 14px;
  padding: 6px 12px;
  border-radius: 8px;
  transition: color .15s, background .15s;
  white-space: nowrap;
}
.nav-link:hover { color: var(--header-fg); background: var(--header-hover); }
.nav-link.active { color: var(--header-fg); background: var(--header-active); font-weight: 600; }

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin-left: 4px;
  border-radius: 8px;
  border: 1px solid var(--header-active);
  background: transparent;
  color: var(--header-fg-2);
  cursor: pointer;
  transition: color .15s, background .15s, border-color .15s;
}
.icon-btn:hover {
  color: var(--header-fg);
  background: var(--header-hover);
  border-color: var(--header-fg-2);
}

@media (max-width: 860px) {
  .hint { display: none; }
  .header { padding: 0 12px; gap: 10px; }
  .brand-link { font-size: 15px; }
  .nav-link { padding: 6px 8px; font-size: 13px; }
}
</style>

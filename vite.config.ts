import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // 体积较大的第三方库单独成块，便于浏览器长期缓存
        manualChunks: {
          vue: ['vue', 'vue-router'],
          'element-plus': ['element-plus'],
        },
      },
    },
  },
  server: {
    port: 5173,
    open: true,
    proxy: {
      // 开发环境把 /api 转发到后端 Node 服务
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})
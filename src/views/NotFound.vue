<template>
  <div class="nf">
    <div class="code">404</div>
    <p class="desc">页面不存在，可能已被删除或链接有误。</p>
    <div class="ops">
      <el-button type="primary" @click="$router.push('/')">回到文档列表</el-button>
      <el-button @click="goBack">返回上一页</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

function goBack(): void {
  if (window.history.length > 1) router.back()
  else router.push('/')
}
</script>

<style scoped>
.nf {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 120px 20px;
  text-align: center;
}
.code {
  font-size: 64px;
  font-weight: 800;
  letter-spacing: 4px;
  color: var(--brand);
  line-height: 1;
}
.desc {
  margin: 0;
  color: var(--text-2);
  font-size: 15px;
}
.ops {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}
</style>

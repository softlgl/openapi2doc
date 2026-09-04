import { createRouter, createWebHistory } from 'vue-router'
import DocList from '../views/DocList.vue'
import NotFound from '../views/NotFound.vue'

const SITE = 'OpenAPI 接口文档管理'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'list', component: DocList, meta: { title: '文档列表' } },
    // 详情页标题依赖文档名，由页面内自行更新
    {
      path: '/doc/:id',
      name: 'view',
      component: () => import('../views/DocView.vue'),
      props: true,
      meta: { title: '文档详情' },
    },
    {
      path: '/doc/:id/edit',
      name: 'edit',
      component: () => import('../views/DocEdit.vue'),
      props: true,
      meta: { title: '编辑文档' },
    },
    {
      path: '/new',
      name: 'new',
      component: () => import('../views/DocEdit.vue'),
      props: true,
      meta: { title: '新建文档' },
    },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFound, meta: { title: '页面不存在' } },
  ],
})

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : ''
  document.title = title ? `${title} · ${SITE}` : SITE
})

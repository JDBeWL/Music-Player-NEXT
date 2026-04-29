import { createRouter, createWebHashHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/player',
  },
  {
    path: '/player',
    name: 'player',
    component: () => import('@/components/PlayerPage.vue'),
  },
  {
    path: '/local',
    name: 'local',
    component: () => import('@/components/LocalPage.vue'),
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/components/SettingsPage.vue'),
  },
  {
    path: '/netease',
    name: 'netease',
    component: () => import('@/components/NeteasePage.vue'),
  },
  {
    path: '/playlist/:id',
    name: 'playlist-detail',
    component: () => import('@/components/PlaylistDetailPage.vue'),
    props: true,
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;

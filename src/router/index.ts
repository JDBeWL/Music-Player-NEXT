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
    component: () => import('@/components/player/PlayerPage.vue'),
  },
  {
    path: '/local',
    name: 'local',
    component: () => import('@/components/library/LocalPage.vue'),
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/components/settings/SettingsPage.vue'),
  },
  {
    path: '/netease',
    name: 'netease',
    component: () => import('@/components/netease/NeteasePage.vue'),
  },
  {
    path: '/playlist/:id',
    name: 'playlist-detail',
    component: () => import('@/components/library/PlaylistDetailPage.vue'),
    props: true,
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;

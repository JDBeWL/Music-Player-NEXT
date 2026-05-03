<script setup lang="ts">
import { useNeteaseAuthStore } from '@/stores/neteaseAuthStore';
import { useNeteaseSearchStore } from '@/stores/neteaseSearchStore';
import {
  Loader2,
  LogOut,
  RefreshCw,
  QrCode,
  AlertCircle,
  Crown,
  Settings,
} from 'lucide-vue-next';
import { QUALITY_OPTIONS } from '@/services/netease/api';

const authStore = useNeteaseAuthStore();
const searchStore = useNeteaseSearchStore();

const emit = defineEmits<{
  logout: [];
}>();

function getQrStatusText(): string {
  if (!authStore.qrStatus) return '等待扫码...';
  switch (authStore.qrStatus.code) {
    case 801: return '等待扫码...';
    case 802: return '请在手机上确认登录';
    case 803: return '登录成功！';
    case 800: return '二维码已过期';
    default: return '未知状态';
  }
}

function getQrStatusClass(): string {
  if (!authStore.qrStatus) return '';
  switch (authStore.qrStatus.code) {
    case 802: return 'status-confirming';
    case 803: return 'status-success';
    case 800: return 'status-expired';
    default: return '';
  }
}

function handleQualityChange(event: Event) {
  const target = event.target as HTMLSelectElement;
  searchStore.setQuality(target.value as any);
}
</script>

<template>
  <div class="login-panel">
    <div v-if="authStore.isLoggedIn" class="logged-in-panel">
      <img
        v-if="authStore.userProfile?.avatarUrl"
        :src="authStore.userProfile.avatarUrl"
        class="profile-avatar"
        alt="头像"
      />
      <div class="profile-info">
        <span class="profile-name">{{ authStore.userProfile?.nickname }}</span>
        <span v-if="authStore.userProfile?.vipType" class="vip-tag">
          <Crown :size="12" /> VIP
        </span>
      </div>
      <button class="logout-btn" @click="emit('logout')">
        <LogOut :size="14" />
        <span>退出登录</span>
      </button>
    </div>

    <div class="quality-selector">
      <div class="quality-label">
        <Settings :size="14" />
        <span>音质</span>
      </div>
      <select
        :value="searchStore.quality"
        @change="handleQualityChange"
        class="quality-select"
      >
        <option
          v-for="option in QUALITY_OPTIONS"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>
    </div>

    <div v-if="!authStore.isLoggedIn" class="qr-login-panel">
      <div class="qr-title">
        <QrCode :size="18" />
        <span>扫码登录</span>
      </div>
      <div class="qr-container">
        <div v-if="authStore.isQrLoading" class="qr-loading">
          <Loader2 :size="32" class="animate-spin" />
          <span>生成二维码中...</span>
        </div>
        <div v-else-if="authStore.qrImg" class="qr-content">
          <img :src="authStore.qrImg" class="qr-image" alt="扫码登录" />
          <div class="qr-status" :class="getQrStatusClass()">
            {{ getQrStatusText() }}
          </div>
          <button
            v-if="authStore.qrStatus?.code === 800"
            class="refresh-qr-btn"
            @click="authStore.startQrLogin()"
          >
            <RefreshCw :size="14" />
            <span>刷新二维码</span>
          </button>
        </div>
        <div v-else class="qr-error">
          <AlertCircle :size="24" />
          <span>获取二维码失败</span>
          <button class="refresh-qr-btn" @click="authStore.startQrLogin()">
            <RefreshCw :size="14" />
            <span>重试</span>
          </button>
        </div>
      </div>
      <p class="qr-hint">使用Netease App 扫描二维码登录</p>
    </div>
  </div>
</template>

<style scoped>
.login-panel {
  margin-bottom: 16px;
  border-radius: var(--radius-xl);
  border: 1px solid var(--border-subtle);
  background: var(--bg-tertiary);
  overflow: hidden;
  flex-shrink: 0;
}

.logged-in-panel {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
}

.profile-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--border-subtle);
}

.profile-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.profile-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.vip-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #fbbf24;
  font-weight: 600;
}

.logout-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: transparent;
  color: var(--text-tertiary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.logout-btn:hover {
  color: #f87171;
  border-color: #f87171;
}

.quality-selector {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-secondary);
}

.quality-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}

.quality-select {
  padding: 6px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  outline: none;
}

.quality-select:hover {
  border-color: var(--color-primary);
}

.quality-select:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-container);
}

.qr-login-panel {
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.qr-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.qr-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
}

.qr-loading,
.qr-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--text-tertiary);
  font-size: 13px;
}

.qr-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.qr-image {
  width: 160px;
  height: 160px;
  border-radius: var(--radius-lg);
  border: 2px solid var(--border-subtle);
  background: white;
  padding: 4px;
}

.qr-status {
  font-size: 13px;
  color: var(--text-tertiary);
  font-weight: 500;
  padding: 4px 12px;
  border-radius: var(--radius-md);
}

.status-confirming {
  color: var(--color-primary);
  background: var(--color-primary-container);
}

.status-success {
  color: #34d399;
}

.status-expired {
  color: #f87171;
}

.refresh-qr-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: transparent;
  color: var(--color-primary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.refresh-qr-btn:hover {
  background: var(--color-primary-container);
}

.qr-hint {
  font-size: 12px;
  color: var(--text-disabled);
}
</style>

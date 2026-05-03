import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import {
  getQrKey,
  createQrCode,
  checkQrStatus,
  getLoginStatus,
  logout as logoutApi,
} from '@/services/netease/api';
import type {
  NeteaseUserProfile,
  NeteaseQrCheckResult,
} from '@/services/netease/types';

export const useNeteaseAuthStore = defineStore('neteaseAuth', () => {
  const cookie = ref<string>('');
  const userProfile = ref<NeteaseUserProfile | null>(null);
  const isLoggedIn = computed(() => !!cookie.value && !!userProfile.value);

  const qrKey = ref<string>('');
  const qrImg = ref<string>('');
  const qrStatus = ref<NeteaseQrCheckResult | null>(null);
  const isQrLoading = ref(false);
  const qrCheckTimer = ref<ReturnType<typeof setInterval> | null>(null);

  async function saveLoginState() {
    try {
      if (cookie.value && userProfile.value) {
        await invoke('save_netease_auth', {
          cookie: cookie.value,
          profile: JSON.stringify(userProfile.value),
        });
      }
    } catch (error) {
      console.warn('[NeteaseAuthStore] Failed to save login state:', error);
    }
  }

  async function clearLoginState() {
    cookie.value = '';
    userProfile.value = null;
    try {
      await invoke('clear_netease_auth');
    } catch (error) {
      console.warn('[NeteaseAuthStore] Failed to clear login state:', error);
    }
  }

  async function startQrLogin() {
    isQrLoading.value = true;
    qrStatus.value = null;

    try {
      const keyResult = await getQrKey();
      qrKey.value = keyResult.unikey;

      const qrResult = await createQrCode(qrKey.value);
      qrImg.value = qrResult.qrimg;

      startQrPolling();
    } catch (error) {
      console.error('[NeteaseAuthStore] Failed to start QR login:', error);
    } finally {
      isQrLoading.value = false;
    }
  }

  function startQrPolling() {
    stopQrPolling();
    qrCheckTimer.value = setInterval(async () => {
      try {
        const result = await checkQrStatus(qrKey.value);
        qrStatus.value = result;

        if (result.code === 803) {
          stopQrPolling();
          if (result.cookie) {
            cookie.value = result.cookie;
          }
          await refreshLoginStatus();
          saveLoginState();
        } else if (result.code === 800) {
          stopQrPolling();
        } else if (result.code === 404 || result.code === 400) {
          console.warn('[NeteaseAuthStore] QR key invalid or expired, stopping polling');
          stopQrPolling();
        }
      } catch (error) {
        console.error('[NeteaseAuthStore] QR check failed:', error);
        stopQrPolling();
      }
    }, 2000);
  }

  function stopQrPolling() {
    if (qrCheckTimer.value) {
      clearInterval(qrCheckTimer.value);
      qrCheckTimer.value = null;
    }
  }

  async function refreshLoginStatus() {
    if (!cookie.value) return;
    try {
      const status = await getLoginStatus(cookie.value);
      if (status.profile) {
        userProfile.value = status.profile;
        saveLoginState();
      } else {
        clearLoginState();
      }
    } catch (error) {
      console.error('[NeteaseAuthStore] Failed to refresh login status:', error);
    }
  }

  async function logout() {
    try {
      if (cookie.value) {
        await logoutApi(cookie.value);
      }
    } catch (error) {
      console.warn('[NeteaseAuthStore] Logout request failed:', error);
    } finally {
      clearLoginState();
      stopQrPolling();
      qrImg.value = '';
      qrKey.value = '';
      qrStatus.value = null;
    }
  }

  async function init() {
    try {
      const result = await invoke<string | null>('load_netease_auth');
      if (result) {
        const parsed = JSON.parse(result);
        if (parsed.cookie) {
          cookie.value = parsed.cookie;
        }
        if (parsed.profile) {
          userProfile.value = typeof parsed.profile === 'string'
            ? JSON.parse(parsed.profile)
            : parsed.profile;
        }
      }
    } catch (error) {
      console.warn('[NeteaseAuthStore] Failed to restore state:', error);
    }
  }

  return {
    cookie,
    userProfile,
    isLoggedIn,
    qrKey,
    qrImg,
    qrStatus,
    isQrLoading,
    init,
    saveLoginState,
    clearLoginState,
    startQrLogin,
    startQrPolling,
    stopQrPolling,
    refreshLoginStatus,
    logout,
  };
});

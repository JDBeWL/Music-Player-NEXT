<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Info, Loader2, X, Cloud, Check } from 'lucide-vue-next';
import { invoke } from '@tauri-apps/api/core';
import { useConfigStore } from '@/stores/configStore';
import { useNeteaseSearchStore } from '@/stores/neteaseSearchStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { LyricsParser } from '@/utils/lyricsParser';
import { licenseFiles, type LicenseType } from '@/constants/licenses';

const configStore = useConfigStore();
const neteaseSearchStore = useNeteaseSearchStore();
const libraryStore = useLibraryStore();

const neteaseApiInput = ref('');
const isSavingApiBase = ref(false);
const apiSaveSuccess = ref(false);
const isTestingConnection = ref(false);
const connectionTestResult = ref<{ success: boolean; latency?: number; error?: string } | null>(null);

const libraryPath = ref<string>('');

const showLicenseDialog = ref(false);
const licenseDialogTitle = ref('');
const licenseDialogContent = ref('');

const randomLyricData = ref<{ text: string; source: string }>({
  text: '"最後のオンガクになるから！/成为最后的乐音！"',
  source: '——《世界最後の音乐隊 (feat. 初音ミク)》-夏山よつぎ/ど〜ぱみん/初音ミク'
});
const isLoadingLyric = ref(false);

function openLicense(type: LicenseType) {
  const file = licenseFiles[type];
  licenseDialogTitle.value = file.title;
  licenseDialogContent.value = file.content;
  showLicenseDialog.value = true;
}

async function loadRandomLyric() {
  const tracks = libraryStore.libraryTracks;
  if (tracks.length === 0) return;

  isLoadingLyric.value = true;
  try {
    const candidates = tracks.filter(t => t.hasLrc);

    if (candidates.length > 0) {
      const trackWithLrc = candidates[Math.floor(Math.random() * candidates.length)];
      const lrc = await libraryStore.loadLyrics(trackWithLrc);

      if (lrc) {
        const parsedLyrics = await LyricsParser.parseAsync(lrc);

        const forbidden = [
          '作词', '作曲', '编曲', '制作', '词:', '曲:', '编:', '演唱',
          'Mixing', 'Mastering', 'Arrangement', 'Lyrics', 'Composed', 'Written',
          'Produced', 'Vocals', 'Script Info', 'Styles', 'Events', 'Timer:', 'LDDC'
        ];

        const candidateLines = parsedLyrics.filter(line => {
          const text = (line.texts && line.texts.length > 0 ? line.texts[0] : (line.text || '')).trim();
          if (!text) return false;

          return !forbidden.some(word => text.toLowerCase().includes(word.toLowerCase()));
        });

        if (candidateLines.length > 0) {
          const selectedLine = candidateLines[Math.floor(Math.random() * candidateLines.length)];
          const displayedText = selectedLine.texts && selectedLine.texts.length > 0
            ? selectedLine.texts.filter(t => t && t.trim()).join(' / ')
            : (selectedLine.text || '');

          randomLyricData.value = {
            text: `"${displayedText}"`,
            source: `——《${trackWithLrc.title}》${trackWithLrc.artist ? `- ${trackWithLrc.artist}` : ''}`
          };
        }
      }
    }
  } catch (error) {
    console.error('Failed to load random lyric:', error);
  } finally {
    isLoadingLyric.value = false;
  }
}

async function saveNeteaseApiBase() {
  const url = neteaseApiInput.value.trim();
  if (!url) return;
  isSavingApiBase.value = true;
  apiSaveSuccess.value = false;
  try {
    await neteaseSearchStore.updateApiBase(url);
    neteaseApiInput.value = neteaseSearchStore.apiBaseUrl;
    apiSaveSuccess.value = true;
    setTimeout(() => { apiSaveSuccess.value = false; }, 2000);
  } catch (error) {
    console.error('Failed to save API base:', error);
    alert('保存失败: ' + error);
  } finally {
    isSavingApiBase.value = false;
  }
}

async function testNeteaseConnection() {
  isTestingConnection.value = true;
  connectionTestResult.value = null;
  try {
    connectionTestResult.value = await configStore.testNeteaseConnection();
  } finally {
    isTestingConnection.value = false;
  }
}

onMounted(() => {
  if (neteaseSearchStore.apiBaseUrl) {
    neteaseApiInput.value = neteaseSearchStore.apiBaseUrl;
  }

  invoke<string>('get_library_path_info').then(path => {
    libraryPath.value = path;
  }).catch(error => {
    console.error('Failed to get library path:', error);
  });

  loadRandomLyric();
});
</script>

<template>
  <div>
    <h3 class="text-lg font-semibold text-[var(--text-primary)] mb-1 flex items-center gap-2">
      <Cloud :size="20" class="text-[var(--color-primary)]" />
      API Enhanced
    </h3>
    <p class="text-sm text-[var(--text-tertiary)] mb-4">配置API Enhanced 服务地址和 IP 参数</p>

    <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-4">
      <div>
        <label class="block text-sm font-medium text-[var(--text-primary)] mb-2">API 服务地址</label>
        <div class="flex items-center gap-3">
          <input
            v-model="neteaseApiInput"
            type="text"
            placeholder="例如: https://your-api.vercel.app"
            class="flex-1 px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
          />
          <button
            class="md3-btn-filled flex-shrink-0"
            :disabled="isSavingApiBase || !neteaseApiInput.trim()"
            @click="saveNeteaseApiBase"
          >
            <Check v-if="apiSaveSuccess" :size="14" />
            <Loader2 v-else-if="isSavingApiBase" :size="14" class="animate-spin" />
            {{ apiSaveSuccess ? '已保存' : isSavingApiBase ? '保存中...' : '保存' }}
          </button>
        </div>
        <div class="text-xs text-[var(--text-disabled)] mt-2">
          当前地址: {{ neteaseSearchStore.apiBaseUrl || '未配置（使用默认地址）' }}
        </div>
      </div>

      <div>
        <label class="block text-sm font-medium text-[var(--text-primary)] mb-2">Real IP 参数</label>
        <div class="flex items-center gap-3">
          <input
            v-model="configStore.neteaseRealIP"
            type="text"
            placeholder="默认116.25.146.177"
            class="flex-1 px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
            @blur="configStore.setNeteaseRealIP(configStore.neteaseRealIP)"
          />
          <button
            class="md3-btn-outlined text-xs whitespace-nowrap"
            :disabled="isTestingConnection"
            @click="testNeteaseConnection"
          >
            <Loader2 v-if="isTestingConnection" :size="14" class="animate-spin" />
            测试连接
          </button>
        </div>
        <div v-if="connectionTestResult" class="mt-2 text-xs">
          <span v-if="connectionTestResult.success" class="text-green-500">
            连接成功 ({{ connectionTestResult.latency }}ms)
          </span>
          <span v-else class="text-red-400">
            连接失败: {{ connectionTestResult.error || '无法连接' }}
          </span>
        </div>
      </div>
    </div>
  </div>

  <div>
    <h3 class="text-lg font-semibold text-[var(--text-primary)] mb-1 flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <Info :size="20" class="text-[var(--color-primary)]" />
        关于
      </div>
      <button
        class="md3-btn-outlined-sm"
        @click="loadRandomLyric"
        title="换一句"
      >
        <Loader2 v-if="isLoadingLyric" :size="10" class="animate-spin" />
        <span v-else>换一句</span>
      </button>
    </h3>
    <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-3">
      <div class="text-center py-3 px-4 relative">
        <div class="lyric-quote-mark top-line">"</div>
        <div class="lyric-text text-base text-[var(--text-primary)] leading-relaxed" style="white-space: pre-wrap;">{{ randomLyricData.text.replace(/^"|"$/g, '') }}</div>
        <div class="lyric-quote-mark bottom-line">"</div>
        <div class="lyric-source text-xs text-[var(--text-tertiary)] mt-3">{{ randomLyricData.source }}</div>
      </div>
      <div class="border-t border-[var(--border-subtle)] pt-3 space-y-2">
        <div class="flex items-center justify-between text-sm">
          <span class="text-[var(--text-primary)]">版本</span>
          <span class="text-[var(--text-secondary)]">0.3.3</span>
        </div>
        <div class="flex items-center justify-between text-sm">
          <span class="text-[var(--text-primary)]">技术栈</span>
          <span class="text-[var(--text-secondary)]">Vue · Tauri · Rust</span>
        </div>
        <div class="flex items-start justify-between gap-4 text-sm">
          <span class="text-[var(--text-primary)] flex-shrink-0">数据目录</span>
          <span class="text-[var(--text-secondary)] text-right break-all leading-relaxed" :title="libraryPath">
            {{ libraryPath || '加载中...' }}
          </span>
        </div>
        <div class="flex items-center justify-between text-sm">
          <span class="text-[var(--text-primary)]">无障碍支持</span>
          <span class="text-[var(--text-secondary)]">支持WCAG 2.1 AA部分要求</span>
        </div>
      </div>
      <div class="border-t border-[var(--border-subtle)] pt-3 mt-2">
        <div class="text-sm font-medium text-[var(--text-primary)] mb-2">开源协议</div>
        <div class="space-y-1.5 text-xs text-[var(--text-tertiary)]">
          <div class="flex items-center justify-between">
            <span>Mercurial Player NEXT</span>
            <span class="text-[var(--text-secondary)]">Apache-2.0</span>
          </div>
          <div class="text-sm font-medium text-[var(--text-primary)]">第三方组件</div>
          <div class="flex items-center justify-between"><span>Vue 3</span><span class="text-[var(--text-secondary)]">MIT</span></div>
          <div class="flex items-center justify-between"><span>Tauri</span><span class="text-[var(--text-secondary)]">MIT</span></div>
          <div class="flex items-center justify-between"><span>TypeScript</span><span class="text-[var(--text-secondary)]">Apache-2.0</span></div>
          <div class="flex items-center justify-between"><span>Pinia</span><span class="text-[var(--text-secondary)]">MIT</span></div>
          <div class="flex items-center justify-between"><span>Radix Vue</span><span class="text-[var(--text-secondary)]">MIT</span></div>
          <div class="flex items-center justify-between"><span>Lucide Icons</span><span class="text-[var(--text-secondary)]">ISC</span></div>
          <div class="flex items-center justify-between"><span>FFmpeg</span><span class="text-[var(--text-secondary)]">LGPL-2.1</span></div>
        </div>
        <div class="mt-2 pt-2 border-t border-[var(--border-subtle)] flex gap-4 text-xs">
          <button @click="openLicense('notice')" class="text-[var(--color-primary)] hover:underline cursor-pointer bg-transparent border-none p-0">NOTICE</button>
          <button @click="openLicense('thirdParty')" class="text-[var(--color-primary)] hover:underline cursor-pointer bg-transparent border-none p-0">第三方协议</button>
          <button @click="openLicense('license')" class="text-[var(--color-primary)] hover:underline cursor-pointer bg-transparent border-none p-0">LICENSE</button>
        </div>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="showLicenseDialog"
      class="license-overlay"
      @click.self="showLicenseDialog = false"
      role="presentation"
    >
      <div
        class="license-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="'license-title'"
      >
        <div class="license-header">
          <h3 id="license-title" class="license-title">{{ licenseDialogTitle }}</h3>
          <button class="license-close" @click="showLicenseDialog = false" aria-label="关闭">
            <X :size="18" />
          </button>
        </div>
        <div class="license-body">
          <pre class="license-content">{{ licenseDialogContent }}</pre>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.lyric-quote-mark {
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: 48px;
  line-height: 1;
  color: var(--color-primary);
  opacity: 0.25;
  user-select: none;
  pointer-events: none;
  position: absolute;
}

.lyric-quote-mark.top-line {
  top: -4px;
  left: 8px;
}

.lyric-quote-mark.bottom-line {
  bottom: 28px;
  right: 8px;
}

.lyric-text {
  font-family: 'Georgia', 'Noto Serif SC', 'SimSun', serif;
  letter-spacing: 0.02em;
  text-indent: 0;
}

.lyric-source {
  font-family: system-ui, sans-serif;
  letter-spacing: 0.01em;
  opacity: 0.7;
}

.license-overlay {
  position: fixed;
  inset: 0;
  background: var(--scrim);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.license-dialog {
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: 24px;
  width: 600px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  animation: slideUp 0.2s ease;
}

@keyframes slideUp {
  from { transform: translateY(10px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.license-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 20px 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.license-title {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.license-close {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--text-disabled);
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.license-close:hover {
  background: var(--hover-overlay);
  color: var(--text-primary);
}

.license-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
}

.license-content {
  font-family: ui-monospace, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}
</style>

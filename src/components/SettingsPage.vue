<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { SliderRoot, SliderTrack, SliderRange, SliderThumb } from 'radix-vue';
import { Folder, Trash2, Plus, Loader2, Trash, Music, Sliders, Info, Keyboard, FolderSearch, Database, Palette, X, Cloud, Check } from 'lucide-vue-next';
import { invoke } from '@tauri-apps/api/core';
import { useConfigStore } from '@/stores/configStore';
import { useNeteaseStore } from '@/stores/neteaseStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { usePlaylistStore } from '@/stores/playlistStore';
import { LyricsParser } from '@/utils/lyricsParser';

const configStore = useConfigStore();
const neteaseStore = useNeteaseStore();
const libraryStore = useLibraryStore();
const playlistStore = usePlaylistStore();

// 声明不使用的 emits 以消除警告
defineEmits<{
  (e: 'create-playlist'): void;
  (e: 'open-playlist', id: string): void;
  (e: 'add-to-playlist'): void;
}>();

const neteaseApiInput = ref('');
const isSavingApiBase = ref(false);
const apiSaveSuccess = ref(false);

const isScanning = ref(false);

const folders = computed(() => libraryStore.libraryFolders);
const scanDepth = computed(() => libraryStore.scanDepth);
const scanProgress = computed(() => libraryStore.scanProgress);

async function addFolder() {
  try {
    const folderPath = await invoke<string | null>('open_folder_dialog');
    if (folderPath) {
      await libraryStore.addFolder(folderPath);
    }
  } catch (error) {
    console.error('Failed to add folder:', error);
  }
}

async function scanFolders() {
  isScanning.value = true;
  try {
    await libraryStore.scanLibraryFolders(playlistStore.playlists);
    await loadCacheInfo();
  } finally {
    isScanning.value = false;
  }
}

const libraryPath = ref<string>('');
const coverCacheCount = ref<number>(0);
const coverCacheDir = ref<string>('');
const isLoadingCacheInfo = ref(false);
const isClearingCache = ref(false);

const recordingAction = ref<string | null>(null);

const showLicenseDialog = ref(false);
const licenseDialogTitle = ref('');
const licenseDialogContent = ref('');

const licenseFiles = {
  notice: {
    title: 'NOTICE',
    content: `Mercurial Player NEXT

Copyright 2026 Mercurial

This project includes the following third-party components with their respective licenses:

## FFmpeg

This program uses FFmpeg, which is licensed under the GNU Lesser General Public License version 2.1 (LGPL 2.1).

FFmpeg Website: https://ffmpeg.org/
FFmpeg Source: https://github.com/FFmpeg/FFmpeg

LGPL 2.1 License Text:
FFmpeg is free software; you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation; either version 2.1 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.`
  },
  thirdParty: {
    title: '第三方协议',
    content: `# Third-Party Licenses

This project includes the following third-party components with their respective licenses:

## FFmpeg - LGPL 2.1

This program uses FFmpeg, which is licensed under the GNU Lesser General Public License version 2.1 (LGPL 2.1).

FFmpeg Website: https://ffmpeg.org/
FFmpeg Source: https://github.com/FFmpeg/FFmpeg

### LGPL 2.1 License Text

FFmpeg is free software; you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation; either version 2.1 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.

### @ffmpeg/ffmpeg npm Package - LGPL 2.1

The @ffmpeg/ffmpeg npm package used in this project is subject to the LGPL 2.1 license.

npm Package: https://www.npmjs.com/package/@ffmpeg/ffmpeg

## MIT Licensed Components

### Vue 3
- License: MIT License
- Source: https://github.com/vuejs/core

### Pinia
- License: MIT License
- Source: https://github.com/vuejs/pinia

### Radix Vue
- License: MIT License
- Source: https://github.com/radix-vue/radix-vue

### Lucide Icons
- License: ISC License
- Source: https://github.com/lucide-icons/lucide

### Tauri
- License: MIT License
- Source: https://github.com/tauri-apps/tauri

## Apache 2.0 Licensed Components

### TypeScript
- License: Apache 2.0 License
- Source: https://github.com/microsoft/TypeScript`
  },
  license: {
    title: 'LICENSE',
    content: `                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to the Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional license terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS`
  }
};

function openLicense(type: 'notice' | 'thirdParty' | 'license') {
  const file = licenseFiles[type];
  licenseDialogTitle.value = file.title;
  licenseDialogContent.value = file.content;
  showLicenseDialog.value = true;
}

const actionLabels: Record<string, string> = {
  togglePlay: '播放/暂停',
  navigateBack: '后退',
  navigateForward: '前进',
  toggleShuffle: '随机播放',
  cycleRepeat: '循环模式',
  playNext: '下一首',
  playPrev: '上一首',
};

function formatShortcut(shortcut: { code: string; shift: boolean; ctrl: boolean; alt: boolean }): string {
  const parts: string[] = [];
  if (shortcut.ctrl) parts.push('Ctrl');
  if (shortcut.alt) parts.push('Alt');
  if (shortcut.shift) parts.push('Shift');
  const key = shortcut.code.replace('Key', '').replace('Arrow', '').replace('Space', '空格');
  parts.push(key);
  return parts.join(' + ');
}

function startRecordingShortcut(action: string, event?: MouseEvent) {
  event?.stopPropagation();
  recordingAction.value = action;
}

function handleKeydown(e: KeyboardEvent) {
  if (!recordingAction.value) return;
  e.preventDefault();
  e.stopPropagation();

  const shortcut = {
    code: e.code,
    shift: e.shiftKey,
    ctrl: e.ctrlKey,
    alt: e.altKey,
  };

  configStore.setKeyboardShortcut(recordingAction.value, shortcut);
  recordingAction.value = null;
}

function cancelRecording() {
  recordingAction.value = null;
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('click', cancelRecording);

  // 初始化API Enhanced 地址输入框
  if (neteaseStore.apiBaseUrl) {
    neteaseApiInput.value = neteaseStore.apiBaseUrl;
  }

  loadCacheInfo();
  loadRandomLyric(); // 加载随机歌词
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('click', cancelRecording);
});

const progressPercentage = computed(() => {
  if (!scanProgress.value || scanProgress.value.total === 0) return 0;
  return Math.round((scanProgress.value.current / scanProgress.value.total) * 100);
});

const progressText = computed(() => {
  if (!scanProgress.value) return '';
  return `${scanProgress.value.current} / ${scanProgress.value.total}`;
});

// 随机歌词引用状态
const randomLyricData = ref<{ text: string; source: string }>({
  text: '"最後のオンガクになるから！/成为最后的乐音！"',
  source: '——《世界最後の音乐隊 (feat. 初音ミク)》-夏山よつぎ/ど〜ぱみん/初音ミク'
});
const isLoadingLyric = ref(false);

// 异步加载随机歌词
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
        
        // 屏蔽制作人员信息 (支持多语言和常见变体)
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
    await neteaseStore.updateApiBase(url);
    neteaseApiInput.value = neteaseStore.apiBaseUrl;
    apiSaveSuccess.value = true;
    setTimeout(() => { apiSaveSuccess.value = false; }, 2000);
  } catch (error) {
    console.error('Failed to save API base:', error);
    alert('保存失败: ' + error);
  } finally {
    isSavingApiBase.value = false;
  }
}

async function loadCacheInfo() {
  isLoadingCacheInfo.value = true;
  try {
    const [dir, count] = await invoke<[string, number]>('get_cover_cache_info');
    coverCacheDir.value = dir;
    coverCacheCount.value = count;
  } catch (error) {
    console.error('Failed to load cache info:', error);
  } finally {
    isLoadingCacheInfo.value = false;
  }
}

async function clearAllCache() {
  if (!confirm('确定要清理所有缓存吗？这将删除所有封面缓存和搜索索引。')) {
    return;
  }

  isClearingCache.value = true;
  try {
    await invoke('clear_cover_cache');
    await invoke('clear_search_index');
    coverCacheCount.value = 0;
    alert('缓存已清理完毕');
  } catch (error) {
    console.error('Failed to clear cache:', error);
    alert('清理失败: ' + error);
  } finally {
    isClearingCache.value = false;
  }
}

invoke<string>('get_library_path_info').then(path => {
  libraryPath.value = path;
}).catch(error => {
  console.error('Failed to get library path:', error);
});

function getFolderName(folderPath: string): string {
  const parts = folderPath.split(/[/\\]/);
  return parts[parts.length - 1] || folderPath;
}
</script>

<template>
  <section class="flex-1 flex flex-col overflow-hidden no-select" role="main" aria-label="设置">
    <div class="px-8 py-6 no-select" style="border-bottom: 1px solid var(--border-subtle);">
      <h2 class="text-3xl font-bold text-[var(--text-primary)] no-select">设置</h2>
    </div>

    <div class="flex-1 overflow-y-auto px-8 py-6">
      <div class="max-w-3xl no-select space-y-8">
        <div>
          <h3 class="text-lg font-semibold text-[var(--text-primary)] mb-1 flex items-center gap-2">
            <Music :size="20" class="text-[var(--color-primary)]" />
            音乐库
          </h3>
          <p class="text-sm text-[var(--text-tertiary)] mb-4">管理你的音乐文件夹</p>

          <div class="space-y-2 mb-4">
            <div v-for="folder in folders" :key="folder" class="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <Folder :size="18" class="text-[var(--color-primary)] flex-shrink-0" />
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-[var(--text-primary)] truncate">{{ getFolderName(folder) }}</div>
                <div class="text-xs text-[var(--text-tertiary)] truncate">{{ folder }}</div>
              </div>
              <button class="md3-icon-btn-xs state-layer text-[var(--text-tertiary)] hover:text-red-400" @click="libraryStore.removeFolder(folder)" :aria-label="`移除文件夹 ${folder}`">
                <Trash2 :size="16" />
              </button>
            </div>
          </div>

          <div class="flex gap-3">
            <button class="md3-btn-outlined" @click="addFolder">
              <Plus :size="16" />
              添加文件夹
            </button>
            <button
              class="md3-btn-filled"
              :disabled="isScanning || folders.length === 0"
              @click="scanFolders"
            >
              <Loader2 v-if="isScanning" :size="16" class="animate-spin" />
              {{ isScanning ? '扫描中...' : '扫描文件夹' }}
            </button>
          </div>

          <div v-if="isScanning && scanProgress" class="mt-4 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <Loader2 :size="16" class="text-[var(--color-primary)] animate-spin" />
                <span class="text-sm text-[var(--text-secondary)]">正在扫描</span>
              </div>
              <span class="text-sm text-[var(--text-tertiary)]">{{ progressText }} ({{ progressPercentage }}%)</span>
            </div>
            <div class="w-full h-1.5 bg-[var(--border-default)] rounded-full overflow-hidden">
              <div
                class="h-full bg-[var(--color-primary)] rounded-full transition-all duration-300 ease-out"
                :style="{ width: `${progressPercentage}%` }"
              ></div>
            </div>
            <div class="mt-2 text-xs text-[var(--text-disabled)] truncate">
              {{ scanProgress.current_file }}
            </div>
          </div>
        </div>

        <div>
          <h3 class="text-lg font-semibold text-[var(--text-primary)] mb-1 flex items-center gap-2">
            <FolderSearch :size="20" class="text-[var(--color-primary)]" />
            扫描深度
          </h3>
          <p class="text-sm text-[var(--text-tertiary)] mb-4">设置扫描子文件夹的层级深度（1-10）</p>

          <div class="flex items-center gap-4">
            <SliderRoot
              :model-value="[scanDepth || 1]"
              :min="1"
              :max="10"
              :step="1"
              @update:model-value="(v: number[] | undefined) => v && libraryStore.setScanDepth(v[0])"
              class="relative flex items-center select-none touch-none flex-1 h-5"
            >
              <SliderTrack class="bg-[var(--border-default)] relative grow rounded-full h-1.5">
                <SliderRange class="absolute bg-[var(--color-primary)] rounded-full h-full" />
              </SliderTrack>
              <SliderThumb class="block w-5 h-5 bg-[var(--color-primary)] rounded-full shadow-md hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50 transition-transform" />
            </SliderRoot>
            <div class="w-12 text-center text-[var(--text-primary)] font-medium tabular-nums">{{ scanDepth || 1 }}</div>
          </div>
        </div>

        <div>
          <h3 class="text-lg font-semibold text-[var(--text-primary)] mb-1 flex items-center gap-2">
            <Database :size="20" class="text-[var(--color-primary)]" />
            缓存管理
          </h3>
          <p class="text-sm text-[var(--text-tertiary)] mb-4">清理封面缓存和搜索索引</p>

          <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <span class="text-[var(--text-primary)] font-medium">封面缓存</span>
                <span class="block text-sm text-[var(--text-tertiary)]">已缓存的封面数量</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-[var(--text-secondary)]">{{ isLoadingCacheInfo ? '加载中...' : `${coverCacheCount} 个封面` }}</span>
                <button
                  class="md3-btn-filled"
                  :disabled="isClearingCache || isLoadingCacheInfo || coverCacheCount === 0"
                  @click="clearAllCache"
                >
                  <Loader2 v-if="isClearingCache" :size="14" class="animate-spin" />
                  <Trash v-else :size="14" />
                  {{ isClearingCache ? '清理中...' : '清理缓存' }}
                </button>
              </div>
            </div>
            <div class="text-xs text-[var(--text-disabled)]">
              缓存位置: {{ coverCacheDir || '加载中...' }}
            </div>
          </div>
        </div>

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
                当前地址: {{ neteaseStore.apiBaseUrl || '未配置（使用默认地址）' }}
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
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 class="text-lg font-semibold text-[var(--text-primary)] mb-1 flex items-center gap-2">
            <Sliders :size="20" class="text-[var(--color-primary)]" />
            歌词显示
          </h3>
          <p class="text-sm text-[var(--text-tertiary)] mb-4">配置歌词显示样式和行为</p>

          <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-5">
            <div class="flex items-center justify-between">
              <div>
                <span class="text-[var(--text-primary)] font-medium">显示模式</span>
                <span class="block text-sm text-[var(--text-tertiary)]">选择歌词显示的样式</span>
              </div>
              <div class="flex gap-2">
                <button
                  class="md3-chip"
                  :class="configStore.lyricsDisplayMode === 'modern' ? 'md3-chip-selected' : ''"
                  @click="configStore.setLyricsDisplayMode('modern')"
                >
                  现代模式
                </button>
                <button
                  class="md3-chip"
                  :class="configStore.lyricsDisplayMode === 'classic' ? 'md3-chip-selected' : ''"
                  @click="configStore.setLyricsDisplayMode('classic')"
                >
                  经典模式
                </button>
              </div>
            </div>

            <div class="flex items-center justify-between">
              <div>
                <span class="text-[var(--text-primary)] font-medium">显示翻译</span>
                <span class="block text-sm text-[var(--text-tertiary)]">显示歌词的翻译文本</span>
              </div>
              <button
                class="w-12 h-7 rounded-full transition-colors relative"
                :class="configStore.showTranslation ? 'bg-[var(--color-primary)]' : 'bg-[var(--border-default)]'"
                role="switch"
                :aria-checked="configStore.showTranslation"
                aria-label="显示翻译"
                @click="configStore.toggleTranslation"
              >
                <span class="absolute w-5 h-5 bg-white rounded-full top-1 transition-transform" :class="configStore.showTranslation ? 'left-6' : 'left-1'"></span>
              </button>
            </div>

            <div v-if="configStore.lyricsDisplayMode === 'modern'" class="flex items-center justify-between">
              <div>
                <span class="text-[var(--text-primary)] font-medium">模糊效果</span>
                <span class="block text-sm text-[var(--text-tertiary)]">非当前歌词行的模糊效果</span>
              </div>
              <button
                class="w-12 h-7 rounded-full transition-colors relative"
                :class="configStore.enableLyricsBlur ? 'bg-[var(--color-primary)]' : 'bg-[var(--border-default)]'"
                role="switch"
                :aria-checked="configStore.enableLyricsBlur"
                aria-label="模糊效果"
                @click="configStore.toggleLyricsBlur"
              >
                <span class="absolute w-5 h-5 bg-white rounded-full top-1 transition-transform" :class="configStore.enableLyricsBlur ? 'left-6' : 'left-1'"></span>
              </button>
            </div>
          </div>
        </div>

        <div>
          <h3 class="text-lg font-semibold text-[var(--text-primary)] mb-1 flex items-center gap-2">
            <Palette :size="20" class="text-[var(--color-primary)]" />
            外观
          </h3>
          <p class="text-sm text-[var(--text-tertiary)] mb-4">配置应用的外观和主题</p>

          <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-5">
            <div class="flex items-center justify-between">
              <div>
                <span class="text-[var(--text-primary)] font-medium">主题模式</span>
                <span class="block text-sm text-[var(--text-tertiary)]">选择应用的显示主题</span>
              </div>
              <div class="flex gap-2">
                <button
                  class="md3-chip"
                  :class="configStore.themeMode === 'dark' ? 'md3-chip-selected' : ''"
                  @click="configStore.setThemeMode('dark')"
                >
                  暗色模式
                </button>
                <button
                  class="md3-chip"
                  :class="configStore.themeMode === 'light' ? 'md3-chip-selected' : ''"
                  @click="configStore.setThemeMode('light')"
                >
                  亮色模式
                </button>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 class="text-lg font-semibold text-[var(--text-primary)] mb-1 flex items-center gap-2">
            <Sliders :size="20" class="text-[var(--color-primary)]" />
            窗口行为
          </h3>
          <p class="text-sm text-[var(--text-tertiary)] mb-4">配置关闭窗口时的行为</p>

          <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <span class="text-[var(--text-primary)] font-medium">关闭按钮行为</span>
                <span class="block text-sm text-[var(--text-tertiary)]">选择点击关闭按钮时的行为</span>
              </div>
              <div class="flex gap-2">
                <button
                  class="md3-chip"
                  :class="configStore.closeBehavior === 'to_tray' ? 'md3-chip-selected' : ''"
                  @click="configStore.setCloseBehavior('to_tray')"
                >
                  最小化到托盘
                </button>
                <button
                  class="md3-chip"
                  :class="configStore.closeBehavior === 'quit' ? 'md3-chip-selected' : ''"
                  @click="configStore.setCloseBehavior('quit')"
                >
                  直接退出
                </button>
              </div>
            </div>

            <div class="border-t border-[var(--border-subtle)]"></div>

            <div class="flex items-center justify-between">
              <div>
                <span class="text-[var(--text-primary)] font-medium">记住播放状态</span>
                <span class="block text-sm text-[var(--text-tertiary)]">重新打开时恢复上次的播放进度</span>
              </div>
              <button
                class="w-12 h-7 rounded-full transition-colors relative"
                :class="configStore.persistPlayback ? 'bg-[var(--color-primary)]' : 'bg-[var(--border-default)]'"
                role="switch"
                :aria-checked="configStore.persistPlayback"
                aria-label="记住播放状态"
                @click="configStore.setPersistPlayback(!configStore.persistPlayback)"
              >
                <span class="absolute w-5 h-5 bg-white rounded-full top-1 transition-transform" :class="configStore.persistPlayback ? 'left-6' : 'left-1'"></span>
              </button>
            </div>
          </div>
        </div>

        <div>
          <h3 class="text-lg font-semibold text-[var(--text-primary)] mb-1 flex items-center gap-2">
            <Keyboard :size="20" class="text-[var(--color-primary)]" />
            键盘快捷键
          </h3>
          <p class="text-sm text-[var(--text-tertiary)] mb-4">自定义全局键盘快捷键，按下按钮后直接按键盘设置</p>

          <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-4">
            <div v-for="(shortcut, action, index) in configStore.keyboardShortcuts" :key="action" class="flex items-center justify-between" :class="index !== Object.keys(configStore.keyboardShortcuts).length - 1 ? 'pb-4 border-b border-[var(--border-subtle)]' : ''">
              <span class="text-[var(--text-secondary)]">{{ actionLabels[action] || action }}</span>
              <button
                class="min-w-[120px] px-3 py-1.5 rounded-lg border text-sm text-center transition-all"
                :class="recordingAction === action
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] animate-pulse'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-[var(--color-primary)]'"
                @click="startRecordingShortcut(action, $event)"
              >
                {{ recordingAction === action ? '按下快捷键...' : formatShortcut(shortcut) }}
              </button>
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
              class="text-xs text-[var(--color-primary)] hover:underline bg-transparent border-none p-0 cursor-pointer flex items-center gap-1"
              @click="loadRandomLyric"
              title="换一句"
            >
              <Loader2 v-if="isLoadingLyric" :size="12" class="animate-spin" />
              <span v-else>换一句</span>
            </button>
          </h3>
          <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-3">
            <div class="text-center py-2 px-4">
              <div class="text-sm text-[var(--text-secondary)] italic leading-relaxed" style="white-space: pre-wrap;">{{ randomLyricData.text }}</div>
              <div class="text-xs text-[var(--text-tertiary)] mt-2">{{ randomLyricData.source }}</div>
            </div>
            <div class="border-t border-[var(--border-subtle)] pt-3 space-y-2">
              <div class="flex items-center justify-between text-sm">
                <span class="text-[var(--text-primary)]">版本</span>
                <span class="text-[var(--text-secondary)]">0.2.1</span>
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
      </div>
    </div>
  </section>

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
.no-select {
  user-select: none;
  -webkit-user-select: none;
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
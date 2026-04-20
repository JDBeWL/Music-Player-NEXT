<template>
    <div class="lyrics-wrapper" :class="`lyrics-style-${configStore.lyricsDisplayMode || 'modern'}`" :style="`--lyrics-blur-amount: ${configStore.enableLyricsBlur ? 2 : 0}px; --lyrics-inactive-opacity: ${configStore.enableLyricsBlur ? 0.6 : 0.7}`">
        <div class="lyrics-display" ref="containerRef" @scroll="handleScroll" @mouseenter="isHovering = true" @mouseleave="isHovering = false">
            <div v-if="loading" class="loading">加载中...</div>

            <!-- 没有播放音乐时显示空闲状态 -->
            <div v-else-if="!hasCurrentTrack" class="no-lyrics idle-state">
                <span>当前没有播放的歌曲</span>
            </div>

            <!-- 有音乐但没有歌词 -->
            <div v-else-if="!lyrics.length" class="no-lyrics">
                <span>暂无歌词</span>
            </div>

            <div v-else>
                <div class="lyrics-spacer-up"></div>

                <div class="lyrics" v-for="(line, index) in lyrics" :key="index" :class="{ active: isActive(index) }"
                    :style="{
                        // 根据配置的对齐方式，动态调整缩放锚点 (左/中/右)，防止放大时位移
                        '--align-origin': 'center center',
                        // 应用用户配置的字体和对齐
                        textAlign: 'center',
                        fontFamily: 'inherit'
                    }" @click="handleLyricClick(line.time, index)">
                    <template v-if="line.karaoke && isActive(index)">
                        <div class="first-line karaoke-line"><span v-for="(word, idx) in line.words" :key="idx" class="karaoke-text"
                                :class="{ 'active': isWordActive(word), 'animating': isWordAnimating(word) }" :style="getKaraokeStyle(word)">{{ word.text }}</span></div>
                        <div class="last-line translation" v-if="line.texts[1] && configStore.showTranslation">{{ line.texts[1] }}</div>
                    </template>

                    <template v-else>
                        <div class="first-line">{{ line.texts[0] }}</div>
                        <div class="last-line translation" v-if="line.texts[1] && configStore.showTranslation">{{ line.texts[1] }}</div>
                    </template>
                </div>

                <div class="lyrics-spacer-down"></div>
            </div>
        </div>
    </div>
</template>

<script>
import { usePlayerStore } from '@/stores/playerStore';
import { useConfigStore } from '@/stores/configStore';
import { nextTick, ref, watch, onMounted, onUnmounted, computed } from 'vue';
import { useLyrics } from '@/composables/useLyrics';
import '@/assets/css/lyrics-modern.css';
import '@/assets/css/lyrics-classic.css';

export default {
    name: "LyricsDisplay",
    setup() {
        const playerStore = usePlayerStore();
        const configStore = useConfigStore();
        const containerRef = ref(null);

        // 使用 composable
        const lyricsComposable = useLyrics();
        const { lyrics, loading, lyricsSource, cleanup: cleanupLyrics } = lyricsComposable;
        
        // 本地高频 activeIndex，基于 visualTime 计算，避免滚动延迟
        const activeIndex = ref(-1);
        
        // 是否有当前播放的曲目
        const hasCurrentTrack = computed(() => !!playerStore.currentTrack);

        // --- 视觉时间系统 ---
        const visualTime = ref(0);
        const isUserScroll = ref(false); // 标记用户是否正在交互
        let rafId = null;
        let lastFrameTime = 0;

        // 启动高频时间循环（仅在播放时运行）
        const startAnimationLoop = () => {
            if (rafId) return; // 防止重复启动
            lastFrameTime = 0; // 重置时间戳
            // 启动时先同步到真实时间
            visualTime.value = playerStore.currentTime;
            
            const animate = (timestamp) => {
                if (!lastFrameTime) lastFrameTime = timestamp;
                const deltaTime = Math.min((timestamp - lastFrameTime) / 1000, 0.1); // 限制最大 deltaTime 为 100ms
                lastFrameTime = timestamp;

                const realTime = playerStore.currentTime;
                
                // 播放中：基于帧间隔累加时间，并动态调整速度以消除漂移
                const diff = visualTime.value - realTime; // 正值表示视觉领先，负值表示落后

                if (Math.abs(diff) > 0.5) {
                    // 误差超过 0.5s，直接硬同步
                    visualTime.value = realTime;
                } else if (Math.abs(diff) > 0.05) {
                    // 误差在 0.05s ~ 0.5s 之间，使用 P 控制器平滑追赶
                    const speed = 1.0 - diff * 2.0;
                    const clampedSpeed = Math.max(0.7, Math.min(1.3, speed));
                    visualTime.value += deltaTime * clampedSpeed;
                } else {
                    // 误差很小，正常累加
                    visualTime.value += deltaTime;
                }

                rafId = requestAnimationFrame(animate);
            };
            rafId = requestAnimationFrame(animate);
        };
        
        // 停止动画循环
        const stopAnimationLoop = () => {
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        };
        
        // 监听播放状态，控制动画循环的启停
        watch(() => playerStore.isPlaying, (isPlaying) => {
            if (isPlaying) {
                startAnimationLoop();
            } else {
                stopAnimationLoop();
                // 暂停时同步到真实时间
                visualTime.value = playerStore.currentTime;
            }
        }, { immediate: true });

        // 监听真实时间跳变（如拖拽进度条），立即同步
        watch(() => playerStore.currentTime, (newTime, oldTime) => {
            // 检测 seek 操作：时间跳变超过 1.5s（正常播放每次只增加 0.5s）
            // 或者时间倒退（说明用户往回拖了）
            const jump = newTime - oldTime;
            if (Math.abs(jump) > 1.5 || jump < -0.1) {
                visualTime.value = newTime;
            }
        });

        // 监听歌曲切换，立即重置 visualTime 和滚动位置
        watch(() => playerStore.currentTrack?.path, () => {
            // 标记正在切换歌曲，阻止自动滚动
            isTrackChanging.value = true;

            // 切歌时立即同步到当前时间（通常是 0）
            visualTime.value = playerStore.currentTime;
            activeIndex.value = -1;

            // 重置歌词滚动位置到顶部
            nextTick(() => {
                if (containerRef.value) {
                    containerRef.value.style.scrollBehavior = 'auto';
                    containerRef.value.scrollTop = 0;
                    requestAnimationFrame(() => {
                        if (containerRef.value) {
                            containerRef.value.style.scrollBehavior = 'smooth';
                        }
                        // 1秒后解除切换状态，允许自动滚动
                        setTimeout(() => {
                            isTrackChanging.value = false;
                        }, 1000);
                    });
                }
            });
        });

        // 基于高频 visualTime 计算 activeIndex，实现即时滚动
        // 使用节流来减少计算频率，避免每帧都触发响应式更新
        let lastCalcTime = 0;
        const CALC_INTERVAL = 50; // 每 50ms 计算一次，足够流畅且减少开销
        
        watch(visualTime, (time) => {
            if (!lyrics.value.length) {
                if (activeIndex.value !== -1) activeIndex.value = -1;
                return;
            }
            
            // 节流：避免每帧都计算
            const now = performance.now();
            if (now - lastCalcTime < CALC_INTERVAL) return;
            lastCalcTime = now;
            
            // 应用歌词偏移
            const offset = playerStore.lyricsOffset || 0;
            const currentTime = time - offset;
            
            // 二分查找当前歌词索引
            let l = 0, r = lyrics.value.length - 1, idx = -1;
            while (l <= r) {
                const mid = (l + r) >> 1;
                if (lyrics.value[mid].time <= currentTime) {
                    idx = mid;
                    l = mid + 1;
                } else {
                    r = mid - 1;
                }
            }
            
            if (idx !== activeIndex.value) {
                activeIndex.value = idx;
                playerStore.currentLyricIndex = idx; // 同步到 store
            }
        });

        // --- 样式计算逻辑 ---
        const isActive = (index) => index === activeIndex.value;

        const isWordActive = (word) => {
            const offset = playerStore.lyricsOffset || 0;
            const t = visualTime.value - offset;
            return t >= word.start && t < word.end;
        };

        const isWordAnimating = (word) => {
            const offset = playerStore.lyricsOffset || 0;
            const t = visualTime.value - offset;
            return t >= word.start && t <= word.end;
        };

        // 计算卡拉OK单词的填充进度 (0% - 100%)
        const getKaraokeStyle = (word) => {
            const offset = playerStore.lyricsOffset || 0;
            const t = visualTime.value - offset;
            if (t >= word.end) return { '--karaoke-progress': '100%' };
            if (t < word.start) return { '--karaoke-progress': '0%' };

            const duration = word.end - word.start;
            const elapsed = t - word.start;
            const progress = Math.min(100, Math.max(0, (elapsed / duration) * 100));
            return { '--karaoke-progress': `${progress.toFixed(2)}%` };
        };

        // --- 滚动控制 ---
        const isAutoScrolling = ref(false); // 标记是否正在自动滚动
        const isHovering = ref(false);      // 标记鼠标是否悬停
        const isTrackChanging = ref(false); // 标记是否正在切换歌曲
        let scrollTimeout = null;

        const handleScroll = () => {
             // 如果是自动滚动触发的事件，忽略
             if (isAutoScrolling.value) return; 
             
             // 只有当鼠标悬停在歌词区域时，才认为是用户的主动滚动
             if (!isHovering.value) return;

             // 用户手动滚动
             isUserScroll.value = true;
             
             // 用户停止滚动 2.5s 后恢复自动跟随
             if (scrollTimeout) clearTimeout(scrollTimeout);
             scrollTimeout = setTimeout(() => {
                 isUserScroll.value = false;
             }, 2500);
        };

        const scrollToActiveLyric = (immediate = false, isUserClick = false, targetIndex = -1) => {
            if (!containerRef.value) return;
            
            const idx = targetIndex !== -1 ? targetIndex : activeIndex.value;
            // 如果索引无效或列表为空
            if (idx === -1 || !lyrics.value.length) return;

            const container = containerRef.value;
            // 直接通过索引查找元素，比 querySelector(".active") 更可靠
            const lyricElements = container.querySelectorAll('.lyrics');
            if (!lyricElements || !lyricElements[idx]) return;
            
            const activeEl = lyricElements[idx];

            nextTick(() => {
                const containerH = container.clientHeight;
                const elTop = activeEl.offsetTop;
                const elH = activeEl.clientHeight;
                let targetScroll;
                // 更加激进的滚动位置
                const offsetRatio = 0.5;
                targetScroll = elTop - (containerH * offsetRatio) + (elH / 2);

                targetScroll = Math.max(0, targetScroll);
                
                // 标记开始自动滚动，防止 handleScroll 误判
                isAutoScrolling.value = true;

                if (immediate || isUserClick) {
                    container.style.scrollBehavior = 'auto';
                    container.scrollTop = targetScroll;
                    requestAnimationFrame(() => {
                         container.style.scrollBehavior = 'smooth';
                         // 稍作延迟释放标志
                         setTimeout(() => isAutoScrolling.value = false, 100);
                    });
                } else {
                    container.style.scrollBehavior = 'smooth';
                    container.scrollTop = targetScroll;
                    setTimeout(() => isAutoScrolling.value = false, 500);
                }
            });
        };

        // 监听 activeIndex 变化以滚动
        watch(activeIndex, () => {
             // 切换歌曲期间不自动滚动
             if (isTrackChanging.value) return;
             // 只有在非用户滚动状态下才自动跟随
             if (!isUserScroll.value) {
                scrollToActiveLyric();
             }
        });

        // 歌词加载完成后滚动到当前位置
        watch(loading, (newVal) => {
            if (!newVal) {
                // 歌词加载完成后，强制同步 visualTime
                visualTime.value = playerStore.currentTime;
                // 切换歌曲期间不自动滚动
                if (isTrackChanging.value) return;
                // 只有当播放时间大于2秒时才自动滚动，避免切歌时从顶部跳走
                if (playerStore.currentTime > 2) {
                    nextTick(() => scrollToActiveLyric(true));
                }
            }
        });

        // 用户点击歌词跳转
        const handleLyricClick = async (time, index) => {
            if (time < 0) return;
            
            // 点击跳转应打破用户滚动锁定，并强制执行
            isUserScroll.value = false;
            if (scrollTimeout) clearTimeout(scrollTimeout);

            await playerStore.seek(time);
            
            visualTime.value = time;
            const forceSync = () => { visualTime.value = playerStore.currentTime; };
            requestAnimationFrame(forceSync);
            requestAnimationFrame(() => requestAnimationFrame(forceSync));

            // 明确传入目标 index，確保即使 DOM class 更新滞后也能正确找到元素
            nextTick(() => scrollToActiveLyric(true, true, index));
        };

        // 保存 resize 处理函数引用，以便正确清理
        const handleResize = () => scrollToActiveLyric(true);

        // 歌词偏移控制
        const adjustOffset = (delta) => {
            playerStore.adjustLyricsOffset(delta);
        };
        
        const resetOffset = () => {
            playerStore.resetLyricsOffset();
        };
        
        const formatOffset = (offset) => {
            if (offset === 0) return '0s';
            const sign = offset > 0 ? '+' : '';
            return `${sign}${offset.toFixed(1)}s`;
        };

        onMounted(() => {
            // 动画循环由 watch(isPlaying) 控制启停，无需在此启动
            window.addEventListener("resize", handleResize);
        });

        onUnmounted(() => {
        stopAnimationLoop();
        // 清理 scrollTimeout
        if (scrollTimeout) {
            clearTimeout(scrollTimeout);
            scrollTimeout = null;
        }
        // 清理 resize 事件监听器
        window.removeEventListener("resize", handleResize);
        // 清理 useLyrics composable
        cleanupLyrics();
        // 清理任何其他可能的定时器或事件监听器
        isUserScroll.value = false;
        isAutoScrolling.value = false;
    });

        return {
            lyrics, loading, containerRef, configStore, lyricsSource, hasCurrentTrack, playerStore,
            isActive, isWordActive, isWordAnimating, getKaraokeStyle, handleLyricClick,
            handleScroll, isHovering
        };
    }
};
</script>

<style scoped>
.lyrics-wrapper {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
}

.lyrics-display {
    height: 100%;
    padding: 0 32px;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
    scroll-behavior: smooth;
}

.lyrics-display::-webkit-scrollbar {
    display: none;
}

.loading,
.no-lyrics {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #94a3b8;
    font-size: 24px;
    gap: 16px;
}

.idle-state {
    color: #94a3b8;
    opacity: 0.6;
}

.idle-icon {
    font-size: 64px;
    margin-bottom: 8px;
}

.lyrics-spacer-up {
    height: 30vh;
}

.lyrics-spacer-down {
    height: 45vh;
}
</style>
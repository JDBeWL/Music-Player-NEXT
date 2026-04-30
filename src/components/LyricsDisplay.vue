<template>
    <div class="lyrics-wrapper" :class="`lyrics-style-${configStore.lyricsDisplayMode || 'modern'}`">
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
                    :style="getLyricLineStyle(index)" @click="handleLyricClick(line.time, index)">
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
import { usePlaybackStore } from '@/stores/playbackStore';
import { useConfigStore } from '@/stores/configStore';
import { nextTick, ref, watch, onMounted, onUnmounted, computed } from 'vue';
import { useLyrics } from '@/composables/useLyrics';
import '@/assets/css/lyrics-modern.css';
import '@/assets/css/lyrics-classic.css';

export default {
    name: "LyricsDisplay",
    setup() {
        const playbackStore = usePlaybackStore();
        const configStore = useConfigStore();
        const containerRef = ref(null);

        // 使用 composable
        const lyricsComposable = useLyrics();
        const { lyrics, loading, lyricsSource, cleanup: cleanupLyrics } = lyricsComposable;
        
        // 本地高频 activeIndex，基于 visualTime 计算，避免滚动延迟
        const activeIndex = ref(-1);
        
        // 是否有当前播放的曲目
        const hasCurrentTrack = computed(() => !!playbackStore.currentTrack);

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
            visualTime.value = playbackStore.currentTime;
            
            const animate = (timestamp) => {
                if (!lastFrameTime) lastFrameTime = timestamp;
                const deltaTime = Math.min((timestamp - lastFrameTime) / 1000, 0.1); // 限制最大 deltaTime 为 100ms
                lastFrameTime = timestamp;

                const realTime = playbackStore.currentTime;
                
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
        watch(() => playbackStore.isPlaying, (isPlaying) => {
            if (isPlaying) {
                startAnimationLoop();
            } else {
                stopAnimationLoop();
                // 暂停时同步到真实时间
                visualTime.value = playbackStore.currentTime;
            }
        }, { immediate: true });

        // 监听真实时间跳变（如拖拽进度条），立即同步
        watch(() => playbackStore.currentTime, (newTime, oldTime) => {
            // 检测 seek 操作：时间跳变超过 1.5s（正常播放每次只增加 0.5s）
            // 或者时间倒退（说明用户往回拖了）
            const jump = newTime - oldTime;
            if (Math.abs(jump) > 1.5 || jump < -0.1) {
                visualTime.value = newTime;
            }
        });

        // 监听歌曲切换，立即重置 visualTime 和滚动位置
        watch(() => playbackStore.currentTrack?.path, () => {
            // 标记正在切换歌曲，阻止自动滚动
            isTrackChanging.value = true;

            // 切歌时立即同步到当前时间（通常是 0）
            visualTime.value = playbackStore.currentTime;
            activeIndex.value = -1;

            // 重置歌词滚动位置到顶部
            nextTick(() => {
                cancelScrollAnimation();
                if (containerRef.value) {
                    containerRef.value.scrollTop = 0;
                    requestAnimationFrame(() => {
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
            const offset = playbackStore.lyricsOffset || 0;
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
                playbackStore.setCurrentLyricIndex(idx);
            }
        });

        // --- 样式计算逻辑 ---
        const isActive = (index) => index === activeIndex.value;

        const getLyricLineStyle = (index) => {
            const distance = Math.abs(index - activeIndex.value);
            const isModern = (configStore.lyricsDisplayMode || 'modern') === 'modern';

            if (isModern) {
                const blurEnabled = configStore.enableLyricsBlur;
                let blur, opacity, scale;

                if (distance === 0) {
                    blur = 0;
                    opacity = 1;
                    scale = 1;
                } else if (blurEnabled) {
                    blur = Math.min(8, distance * 1.8);
                    opacity = Math.max(0.25, 1 - distance * 0.13);
                    scale = Math.max(0.88, 1 - distance * 0.02);
                } else {
                    blur = 0;
                    opacity = Math.max(0.45, 1 - distance * 0.08);
                    scale = Math.max(0.92, 1 - distance * 0.012);
                }

                return {
                    '--align-origin': 'center center',
                    '--lyric-blur': `${blur}px`,
                    '--lyric-opacity': opacity,
                    '--lyric-scale': scale,
                    textAlign: 'center',
                    fontFamily: 'inherit',
                    filter: `blur(var(--lyric-blur))`,
                    opacity: 'var(--lyric-opacity)',
                    transform: `scale(var(--lyric-scale))`,
                    color: distance === 0 ? 'var(--color-primary)' : 'var(--text-tertiary)',
                };
            } else {
                if (distance === 0) {
                    return {
                        '--align-origin': 'center center',
                        textAlign: 'center',
                        fontFamily: 'inherit',
                        color: 'var(--color-primary)',
                    };
                }

                const opacity = distance <= 1 ? 0.6 : Math.max(0.35, 0.6 - (distance - 1) * 0.08);
                return {
                    '--align-origin': 'center center',
                    '--lyric-opacity': opacity,
                    textAlign: 'center',
                    fontFamily: 'inherit',
                    opacity: 'var(--lyric-opacity)',
                    color: 'var(--text-tertiary)',
                };
            }
        };

        const isWordActive = (word) => {
            const offset = playbackStore.lyricsOffset || 0;
            const t = visualTime.value - offset;
            return t >= word.start && t < word.end;
        };

        const isWordAnimating = (word) => {
            const offset = playbackStore.lyricsOffset || 0;
            const t = visualTime.value - offset;
            return t >= word.start && t <= word.end;
        };

        // 计算卡拉OK单词的填充进度 (0% - 100%)
        const getKaraokeStyle = (word) => {
            const offset = playbackStore.lyricsOffset || 0;
            const t = visualTime.value - offset;
            if (t >= word.end) return { '--karaoke-progress': '100%' };
            if (t < word.start) return { '--karaoke-progress': '0%' };

            const duration = word.end - word.start;
            const elapsed = t - word.start;
            const progress = Math.min(100, Math.max(0, (elapsed / duration) * 100));
            return { '--karaoke-progress': `${progress.toFixed(2)}%` };
        };

        // --- 滚动控制 ---
        const isAutoScrolling = ref(false);
        const isHovering = ref(false);
        const isTrackChanging = ref(false);
        let scrollTimeout = null;
        let scrollAnimationId = null;
        let scrollAnimationStart = 0;
        let scrollAnimationFrom = 0;
        let scrollAnimationTo = 0;
        let scrollAnimationDuration = 0;

        const easeOutExpo = (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
        const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

        const cancelScrollAnimation = () => {
            if (scrollAnimationId) {
                cancelAnimationFrame(scrollAnimationId);
                scrollAnimationId = null;
            }
        };

        const animatedScrollTo = (targetScroll, duration = 600, immediate = false, easing = easeOutExpo) => {
            if (!containerRef.value) return;

            cancelScrollAnimation();

            const container = containerRef.value;

            if (immediate) {
                container.scrollTop = targetScroll;
                return;
            }

            scrollAnimationFrom = container.scrollTop;
            scrollAnimationTo = targetScroll;
            scrollAnimationDuration = duration;
            scrollAnimationStart = 0;
            isAutoScrolling.value = true;

            const animateScroll = (timestamp) => {
                if (!scrollAnimationStart) scrollAnimationStart = timestamp;
                const elapsed = timestamp - scrollAnimationStart;
                const progress = Math.min(elapsed / scrollAnimationDuration, 1);
                const eased = easing(progress);

                container.scrollTop = scrollAnimationFrom + (scrollAnimationTo - scrollAnimationFrom) * eased;

                if (progress < 1) {
                    scrollAnimationId = requestAnimationFrame(animateScroll);
                } else {
                    scrollAnimationId = null;
                    setTimeout(() => { isAutoScrolling.value = false; }, 50);
                }
            };

            scrollAnimationId = requestAnimationFrame(animateScroll);
        };

        const handleScroll = () => {
             if (isAutoScrolling.value) return; 
             if (!isHovering.value) return;

             isUserScroll.value = true;
             cancelScrollAnimation();
             
             if (scrollTimeout) clearTimeout(scrollTimeout);
             scrollTimeout = setTimeout(() => {
                 isUserScroll.value = false;
             }, 2500);
        };

        const scrollToActiveLyric = (immediate = false, isUserClick = false, targetIndex = -1) => {
            if (!containerRef.value) return;
            
            const idx = targetIndex !== -1 ? targetIndex : activeIndex.value;
            if (idx === -1 || !lyrics.value.length) return;

            const container = containerRef.value;
            const lyricElements = container.querySelectorAll('.lyrics');
            if (!lyricElements || !lyricElements[idx]) return;
            
            const activeEl = lyricElements[idx];
            const isModern = (configStore.lyricsDisplayMode || 'modern') === 'modern';

            nextTick(() => {
                const containerH = container.clientHeight;
                const elTop = activeEl.offsetTop;
                const elH = activeEl.clientHeight;
                const targetScroll = Math.max(0, elTop - (containerH * 0.5) + (elH / 2));

                if (immediate || isUserClick) {
                    animatedScrollTo(targetScroll, 0, true);
                } else if (isModern) {
                    const currentScroll = container.scrollTop;
                    const distance = Math.abs(targetScroll - currentScroll);
                    const duration = Math.max(300, Math.min(700, distance * 0.6));
                    animatedScrollTo(targetScroll, duration, false, easeOutExpo);
                } else {
                    const currentScroll = container.scrollTop;
                    const distance = Math.abs(targetScroll - currentScroll);
                    const duration = Math.max(200, Math.min(400, distance * 0.4));
                    animatedScrollTo(targetScroll, duration, false, easeOutCubic);
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
                visualTime.value = playbackStore.currentTime;
                // 切换歌曲期间不自动滚动
                if (isTrackChanging.value) return;
                // 只有当播放时间大于2秒时才自动滚动，避免切歌时从顶部跳走
                if (playbackStore.currentTime > 2) {
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

            await playbackStore.seek(time);
            
            visualTime.value = time;
            const forceSync = () => { visualTime.value = playbackStore.currentTime; };
            requestAnimationFrame(forceSync);
            requestAnimationFrame(() => requestAnimationFrame(forceSync));

            // 明确传入目标 index，確保即使 DOM class 更新滞后也能正确找到元素
            nextTick(() => scrollToActiveLyric(true, true, index));
        };

        // 保存 resize 处理函数引用，以便正确清理
        const handleResize = () => scrollToActiveLyric(true);

        // 歌词偏移控制
        const adjustOffset = (delta) => {
            playbackStore.adjustLyricsOffset(delta);
        };
        
        const resetOffset = () => {
            playbackStore.resetLyricsOffset();
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
        cancelScrollAnimation();
        if (scrollTimeout) {
            clearTimeout(scrollTimeout);
            scrollTimeout = null;
        }
        window.removeEventListener("resize", handleResize);
        cleanupLyrics();
        isUserScroll.value = false;
        isAutoScrolling.value = false;
    });

        return {
            lyrics, loading, containerRef, configStore, lyricsSource, hasCurrentTrack, playbackStore,
            isActive, getLyricLineStyle, isWordActive, isWordAnimating, getKaraokeStyle, handleLyricClick,
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
    color: var(--text-tertiary);
    font-size: 24px;
    gap: 16px;
}

.idle-state {
    color: var(--text-tertiary);
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
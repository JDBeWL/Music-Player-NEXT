import type { LyricLine, LyricsFormat, KaraokeWord } from '@/types'

const yieldToMain = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

const LRC_TIME_REGEX_SOURCE = '(\\d{2}):(\\d{2})(?:\\.(\\d{2,3}))?'
const LRC_LINE_REGEX = /^\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\](.*)$/
const SRT_TIME_REGEX = /(\d{1,2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2}),(\d{3})/
const ASS_TIME_REGEX = /^(\d+):(\d{2}):(\d{2})\.(\d{2})$/

const LRC_TIME_REGEX = new RegExp(`\\[${LRC_TIME_REGEX_SOURCE}\\]`, 'g')
const ASS_KARAOKE_TAG_REGEX = /\{\\k[f]?(\d+)\}([^{}]*)/g
const ASS_CLEAN_TAG_REGEX = /\{.*?\}/g

function parseLrcTimestamp(minutes: string, seconds: string, msStr: string | undefined): number {
  const ms = msStr ? parseInt(msStr.padEnd(3, '0').substring(0, 3)) : 0
  return parseInt(minutes) * 60 + parseInt(seconds) + ms / 1000
}

export class LyricsParser {
  static parse(content: string, format: LyricsFormat = 'auto'): LyricLine[] {
    if (!content || typeof content !== 'string') {
      return []
    }

    if (format === 'auto') {
      format = this.detectFormat(content)
    }

    switch (format.toLowerCase() as LyricsFormat) {
      case 'lrc':
        return this.parseLRC(content)
      case 'ass':
        return this.parseASS(content)
      case 'srt':
        return this.parseSRT(content)
      default:
        console.warn(`Unsupported lyrics format: ${format}`)
        return []
    }
  }

  static async parseAsync(content: string, format: LyricsFormat = 'auto'): Promise<LyricLine[]> {
    if (!content || typeof content !== 'string') {
      return []
    }

    if (format === 'auto') {
      format = this.detectFormat(content)
    }

    switch (format.toLowerCase() as LyricsFormat) {
      case 'lrc':
        return this.parseLRCAsync(content)
      case 'ass':
        return this.parseASSAsync(content)
      default:
        return this.parse(content, format)
    }
  }

  static detectFormat(content: string): LyricsFormat {
    if (content.includes('[Script Info]') || content.includes('[V4+ Styles]') || content.includes('[Events]')) {
      return 'ass'
    }
    if (/^\d+\s*\n\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}\s*\n/m.test(content)) {
      return 'srt'
    }
    return 'lrc'
  }

  static async parseLRCAsync(content: string): Promise<LyricLine[]> {
    const lines = content.split("\n")
    const resultMap: Record<number, LyricLine> = {}
    const CHUNK_SIZE = 100

    for (let i = 0; i < lines.length; i++) {
      if (i > 0 && i % CHUNK_SIZE === 0) {
        await yieldToMain()
      }

      const line = lines[i]
      LRC_TIME_REGEX.lastIndex = 0
      const timestamps: Array<{ time: number; index: number }> = []
      let match: RegExpExecArray | null
      while ((match = LRC_TIME_REGEX.exec(line)) !== null) {
        const time = parseLrcTimestamp(match[1], match[2], match[3])
        timestamps.push({ time, index: match.index })
      }
      if (timestamps.length < 1) continue
      const text = line.replace(LRC_TIME_REGEX, "").trim()
      if (!text) continue
      const startTime = timestamps[0].time
      resultMap[startTime] = resultMap[startTime] || { time: startTime, texts: [], karaoke: null }
      if (timestamps.length > 1) {
        resultMap[startTime].karaoke = {
          fullText: text,
          timings: timestamps.slice(1).map((s, idx) => ({ time: s.time, position: idx + 1 }))
        }
      }
      resultMap[startTime].texts!.push(text)
    }
    return Object.values(resultMap).sort((a, b) => a.time - b.time)
  }

  static async parseASSAsync(content: string): Promise<LyricLine[]> {
    const lines = content.split('\n')
    const dialogues: Array<{ startTime: number; endTime: number; style: string; text: string }> = []
    const toSeconds = (t: string): number => {
      const [h, m, s] = t.split(':')
      return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s)
    }
    const CHUNK_SIZE = 100

    for (let i = 0; i < lines.length; i++) {
      if (i > 0 && i % CHUNK_SIZE === 0) {
        await yieldToMain()
      }

      const line = lines[i]
      if (!line.startsWith('Dialogue:')) continue
      const parts = line.split(',')
      if (parts.length < 10) continue
      const start = parts[1].trim()
      const end = parts[2].trim()
      const style = parts[3].trim()
      const text = parts.slice(9).join(',').trim()
      dialogues.push({ startTime: toSeconds(start), endTime: toSeconds(end), style, text })
    }

    const isTranslationStyle = (style: string): boolean => {
      const lowerStyle = style.toLowerCase()
      const translationKeywords = ['ts', 'translation', 'trans', 'cn', 'zh', 'chs', 'cht', 'chinese', 'romaji', 'roma', 'chn', '翻译', '中文']
      return translationKeywords.some(keyword => lowerStyle.includes(keyword))
    }

    const isOriginalStyle = (style: string): boolean => {
      const lowerStyle = style.toLowerCase()
      const originalKeywords = ['orig', 'original', 'en', 'english', 'jp', 'ja', 'japanese', 'main', 'default', 'lyric', '原文', '日文', '英文']
      return originalKeywords.some(keyword => lowerStyle.includes(keyword))
    }

    const groupedMap = new Map<string, { startTime: number; endTime: number; texts: { orig: string; ts: string }; styles: Set<string>; karaoke: null }>()
    dialogues.forEach(d => {
      const key = d.startTime.toFixed(3) + '-' + d.endTime.toFixed(3)
      if (!groupedMap.has(key)) {
        groupedMap.set(key, { startTime: d.startTime, endTime: d.endTime, texts: { orig: '', ts: '' }, styles: new Set(), karaoke: null })
      }
      const group = groupedMap.get(key)!
      group.styles.add(d.style)

      if (isTranslationStyle(d.style)) {
        group.texts.ts = d.text
      } else if (isOriginalStyle(d.style) || group.texts.orig === '') {
        if (group.texts.orig === '') {
          group.texts.orig = d.text
        } else if (!isTranslationStyle(d.style) && group.texts.ts === '') {
          group.texts.ts = d.text
        }
      } else {
        if (group.texts.ts === '') {
          group.texts.ts = d.text
        }
      }
    })

    const result: LyricLine[] = []
    groupedMap.forEach(group => {
      const parseKaraoke = (text: string): KaraokeWord[] => {
        const words: KaraokeWord[] = []
        let accTime = group.startTime
        ASS_KARAOKE_TAG_REGEX.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = ASS_KARAOKE_TAG_REGEX.exec(text)) !== null) {
          const duration = parseInt(match[1]) * 0.01
          words.push({ text: match[2], start: accTime, end: accTime + duration })
          accTime += duration
        }
        return words
      }
      const enWords = parseKaraoke(group.texts.orig)
      result.push({
        time: group.startTime,
        texts: [group.texts.orig.replace(ASS_CLEAN_TAG_REGEX, ''), group.texts.ts.replace(ASS_CLEAN_TAG_REGEX, '')],
        words: enWords,
        karaoke: enWords.length > 0 ? { fullText: group.texts.orig, timings: [] } : null
      })
    })
    return result.sort((a, b) => a.time - b.time)
  }

  static parseLRC(content: string): LyricLine[] {
    const lines = content.split('\n')
    const lyrics: LyricLine[] = []

    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine) continue

      const timeMatches = [...trimmedLine.matchAll(LRC_TIME_REGEX)]
      const textPart = trimmedLine.replace(LRC_TIME_REGEX, '').trim()

      if (timeMatches.length > 0 && textPart) {
        for (const match of timeMatches) {
          const time = parseLrcTimestamp(match[1], match[2], match[3])
          lyrics.push({ time, text: textPart })
        }
      } else {
        const singleMatch = LRC_LINE_REGEX.exec(trimmedLine)
        if (singleMatch) {
          const time = parseLrcTimestamp(singleMatch[1], singleMatch[2], singleMatch[3])
          const text = singleMatch[4].trim()
          if (text) {
            lyrics.push({ time, text })
          }
        }
      }
    }

    lyrics.sort((a, b) => a.time - b.time)
    return lyrics
  }

  static parseASS(content: string): LyricLine[] {
    const lines = content.split('\n')
    const lyrics: LyricLine[] = []
    let inEvents = false
    let formatFields: string[] = []

    for (const line of lines) {
      const trimmedLine = line.trim()

      if (trimmedLine === '[Events]') {
        inEvents = true
        continue
      }

      if (inEvents && trimmedLine.startsWith('[')) {
        inEvents = false
        continue
      }

      if (inEvents && trimmedLine.startsWith('Format:')) {
        formatFields = trimmedLine.substring(7).split(',').map(field => field.trim())
        continue
      }

      if (inEvents && trimmedLine.startsWith('Dialogue:')) {
        const parts = trimmedLine.substring(9).split(',')

        if (parts.length >= formatFields.length) {
          const startIndex = formatFields.indexOf('Start')
          const textIndex = formatFields.indexOf('Text')

          if (startIndex !== -1 && textIndex !== -1) {
            const startTime = this.parseASSTime(parts[startIndex])
            const text = parts.slice(textIndex).join(',').replace(ASS_CLEAN_TAG_REGEX, '').trim()

            if (text && startTime !== null) {
              lyrics.push({ time: startTime, text })
            }
          }
        }
      }
    }

    lyrics.sort((a, b) => a.time - b.time)
    return lyrics
  }

  static parseSRT(content: string): LyricLine[] {
    const blocks = content.trim().split(/\n\s*\n/)
    const lyrics: LyricLine[] = []

    for (const block of blocks) {
      const lines = block.trim().split('\n')
      if (lines.length < 2) continue

      const timeMatch = lines[1].match(SRT_TIME_REGEX)
      if (!timeMatch) continue

      const startTime = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 +
        parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1000
      const text = lines.slice(2).join('\n').trim()

      if (text) {
        lyrics.push({ time: startTime, text })
      }
    }

    lyrics.sort((a, b) => a.time - b.time)
    return lyrics
  }

  static parseASSTime(timeStr: string): number | null {
    const match = ASS_TIME_REGEX.exec(timeStr)
    if (match) {
      return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 +
        parseInt(match[3]) + parseInt(match[4]) / 100
    }
    return null
  }

  static stringify(lyrics: LyricLine[], format: LyricsFormat = 'lrc'): string {
    if (!lyrics || !Array.isArray(lyrics)) {
      return ''
    }

    switch (format.toLowerCase() as LyricsFormat) {
      case 'lrc':
        return this.stringifyLRC(lyrics)
      case 'ass':
        return this.stringifyASS(lyrics)
      case 'srt':
        return this.stringifySRT(lyrics)
      default:
        console.warn(`Unsupported export format: ${format}`)
        return ''
    }
  }

  static stringifyLRC(lyrics: LyricLine[]): string {
    return lyrics.map(item => {
      const minutes = Math.floor(item.time / 60)
      const seconds = Math.floor(item.time % 60)
      const milliseconds = Math.floor((item.time % 1) * 100)
      const timeTag = `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}]`
      return `${timeTag}${item.text || ''}`
    }).join('\n')
  }

  static stringifyASS(lyrics: LyricLine[]): string {
    let ass = `[Script Info]
Title: Lyrics
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`
    return ass + lyrics.map((item, index) => {
      const formatTime = (t: number): string => {
        const h = Math.floor(t / 3600)
        const m = Math.floor((t % 3600) / 60)
        const s = Math.floor(t % 60)
        const cs = Math.floor((t % 1) * 100)
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`
      }
      const nextTime = index < lyrics.length - 1 ? lyrics[index + 1].time : item.time + 5
      return `Dialogue: 0,${formatTime(item.time)},${formatTime(nextTime)},Default,,0,0,0,,${item.text || ''}`
    }).join('\n')
  }

  static stringifySRT(lyrics: LyricLine[]): string {
    return lyrics.map((item, index) => {
      const formatTime = (t: number): string => {
        const h = Math.floor(t / 3600)
        const m = Math.floor((t % 3600) / 60)
        const s = Math.floor(t % 60)
        const ms = Math.floor((t % 1) * 1000)
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`
      }
      const nextTime = index < lyrics.length - 1 ? lyrics[index + 1].time : item.time + 5
      return `${index + 1}\n${formatTime(item.time)} --> ${formatTime(nextTime)}\n${item.text || ''}\n`
    }).join('\n')
  }
}

export default LyricsParser

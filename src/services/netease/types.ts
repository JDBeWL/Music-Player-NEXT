/**
 * API Enhanced 类型定义
 *
 * 注意：/cloudsearch 接口返回新版字段名 (ar, al, dt)
 *       /search 接口返回旧版字段名 (artists, album, duration)
 *       这里同时定义两套字段以兼容
 */

export interface NeteaseSearchResult {
  id: number;
  name: string;
  // 新版字段 (/cloudsearch)
  ar?: NeteaseArtist[];
  al?: NeteaseAlbum;
  dt?: number; // 毫秒
  // 旧版字段 (/search)
  artists?: NeteaseArtist[];
  album?: NeteaseAlbum;
  duration?: number; // 毫秒
  fee: number; // 0: 免费, 1: VIP, 4: 购买专辑, 8: 低品质免费
  privilege?: NeteasePrivilege;
}

export interface NeteaseArtist {
  id: number;
  name: string;
}

export interface NeteaseAlbum {
  id: number;
  name: string;
  picUrl?: string;
}

export interface NeteasePrivilege {
  id: number;
  fee: number;
  st: number; // 状态：0 正常, -200 被下架
  pl: number; // 播放品质
  maxbr: number; // 最大比特率
}

export interface NeteaseSongUrl {
  id: number;
  url: string | null;
  br: number; // 比特率
  size: number;
  type: string; // mp3, flac等
  fee: number;
  code: number; // 200: 成功
  freeTrialPrivilege?: {
    resConsumable: boolean;
    userConsumable: boolean;
    listenType: number | null;
    cannotListenReason: number;
    playReason: number | null;
    freeLimitTagType: number | null;
  };
}

export interface NeteaseLyric {
  lrc?: { lyric: string };
  tlyric?: { lyric: string }; // 翻译歌词
  romalrc?: { lyric: string }; // 罗马音歌词
}

export interface NeteaseUserProfile {
  userId: number;
  nickname: string;
  avatarUrl: string;
  vipType: number;
}

export interface NeteaseLoginStatus {
  code: number;
  profile: NeteaseUserProfile | null;
}

export interface NeteaseQrKeyResult {
  code: number;
  unikey: string;
}

export interface NeteaseQrCreateResult {
  qrurl: string;
  qrimg: string; // base64 data url
}

export interface NeteaseQrCheckResult {
  code: number; // 800: 过期, 801: 等扫码, 802: 已扫码待确认, 803: 授权登录成功
  message: string;
  cookie?: string;
}

export interface NeteaseSearchResponse {
  code: number;
  result: {
    songs: NeteaseSearchResult[];
    songCount: number;
  };
}

export interface NeteaseSongUrlResponse {
  code: number;
  data: NeteaseSongUrl[];
}

export interface NeteaseLyricResponse {
  code: number;
  lrc?: { lyric: string };
  tlyric?: { lyric: string };
  romalrc?: { lyric: string };
}

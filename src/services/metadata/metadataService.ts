import * as mm from 'music-metadata';

export interface TrackMetadata {
  title: string;
  artist?: string;
  album?: string;
  year?: number;
  duration?: number;
  genre?: string[];
  picture?: {
    data: Uint8Array;
    format: string;
  };
  format?: string;
  bitrate?: number;
  sampleRate?: number;
}

export async function parseAudioMetadata(
  fileData: ArrayBuffer | Uint8Array,
  mimeType?: string
): Promise<TrackMetadata> {
  try {
    // 确保使用 Uint8Array
    const uint8Array = fileData instanceof Uint8Array
      ? fileData
      : new Uint8Array(fileData);

    console.log('[MetadataService] Parsing with music-metadata, size:', uint8Array.length, 'mimeType:', mimeType);

    // 尝试使用 parseBuffer (更可靠)
    let metadata;
    try {
      console.log('[MetadataService] Trying parseBuffer...');
      metadata = await mm.parseBuffer(uint8Array, { mimeType });
      console.log('[MetadataService] parseBuffer succeeded');
    } catch (bufferError) {
      console.warn('[MetadataService] parseBuffer failed, trying parseBlob...', bufferError);
      // 回退到 parseBlob
      const blob = new Blob([new Uint8Array(uint8Array.buffer as ArrayBuffer)], { type: mimeType || 'audio/mpeg' });
      metadata = await mm.parseBlob(blob);
      console.log('[MetadataService] parseBlob succeeded');
    }

    console.log('[MetadataService] Raw metadata:', {
      common: metadata.common,
      format: metadata.format,
      hasPicture: metadata.common.picture?.length
    });

    const common = metadata.common;

    let picture;
    if (common.picture && common.picture.length > 0) {
      console.log('[MetadataService] Found', common.picture.length, 'picture(s)');

      // 优先选择封面类型的图片
      // 优先级: Cover (front) > Other > 任意第一张
      let selectedPic = common.picture.find(p =>
        p.type === 'Cover (front)' || p.description === 'Cover (front)'
      );

      if (!selectedPic) {
        // 如果没有明确的前封面，找其他封面类型
        selectedPic = common.picture.find(p =>
          p.type?.includes('Cover') || p.description?.includes('Cover')
        );
      }

      // 最后使用第一张图片作为后备
      if (!selectedPic) {
        selectedPic = common.picture[0];
      }

      console.log('[MetadataService] Selected picture:', {
        format: selectedPic.format,
        type: selectedPic.type,
        description: selectedPic.description,
        dataSize: selectedPic.data.length
      });

      picture = {
        data: selectedPic.data,
        format: selectedPic.format,
      };
    } else {
      console.log('[MetadataService] No pictures found in common.picture');
    }

    return {
      title: common.title || 'Unknown Title',
      artist: common.artist,
      album: common.album,
      year: common.year,
      duration: metadata.format.duration,
      genre: common.genre,
      picture,
      format: metadata.format.container,
      bitrate: metadata.format.bitrate,
      sampleRate: metadata.format.sampleRate,
    };
  } catch (error) {
    console.error('[MetadataService] Parse error:', error);
    throw error;
  }
}

export function createArtworkUrl(picture: { data: Uint8Array; format: string }): string {
  const blob = new Blob([new Uint8Array(picture.data.buffer as ArrayBuffer)], { type: picture.format });
  return URL.createObjectURL(blob);
}

export function revokeArtworkUrl(url: string) {
  URL.revokeObjectURL(url);
}

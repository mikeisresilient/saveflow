export interface RawFormat {
  formatId: string;
  extension: string;
  width?: number | null;
  height?: number | null;
  resolution?: string | null;
  fps?: number | null;
  videoCodec?: string | null;
  audioCodec?: string | null;
  fileSize?: number | null;
  bitrate?: number | null;
}

export interface VideoFormat {
  formatId: string;
  type: "video";
  quality: string;
  extension: string;
  width: number;
  height: number;
  fps: number | null;
  fileSize: number | null;
}

export interface AudioFormat {
  formatId: string;
  type: "audio";
  quality: string;
  extension: string;
  bitrate: number | null;
  fileSize: number | null;
}

export interface ProcessedFormats {
  video: VideoFormat[];
  audio: AudioFormat[];
}

function formatFileSize(bytes: number | null): string | null {
  if (!bytes) {
    return null;
  }

  const mb = bytes / (1024 * 1024);

  if (mb < 1) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${mb.toFixed(1)} MB`;
}

function getVideoQuality(height: number): string {
  if (height >= 2160) return "2160p";
  if (height >= 1440) return "1440p";
  if (height >= 1080) return "1080p";
  if (height >= 720) return "720p";
  if (height >= 480) return "480p";
  if (height >= 360) return "360p";
  if (height >= 240) return "240p";

  return `${height}p`;
}

function getAudioQuality(bitrate: number | null): string {
  if (!bitrate) {
    return "Audio";
  }

  if (bitrate >= 300) return "320 kbps";
  if (bitrate >= 180) return "192 kbps";
  if (bitrate >= 120) return "128 kbps";
  if (bitrate >= 80) return "96 kbps";

  return `${Math.round(bitrate)} kbps`;
}

export function processFormats(
  formats: RawFormat[]
): ProcessedFormats {
  const videoMap = new Map<string, VideoFormat>();
  const audioMap = new Map<string, AudioFormat>();

  for (const format of formats) {
    const hasVideo =
      format.videoCodec &&
      format.videoCodec !== "none" &&
      format.width &&
      format.height;

    const hasAudio =
      format.audioCodec &&
      format.audioCodec !== "none";

    if (hasVideo) {
      const quality = getVideoQuality(format.height!);

      // We only want MP4 video formats for the initial version.
      if (format.extension !== "mp4") {
        continue;
      }

      // Avoid exposing duplicate qualities.
      if (!videoMap.has(quality)) {
        videoMap.set(quality, {
          formatId: format.formatId,
          type: "video",
          quality,
          extension: format.extension,
          width: format.width!,
          height: format.height!,
          fps: format.fps ?? null,
          fileSize: format.fileSize ?? null,
        });
      }
    }

    if (hasAudio) {
      const isAudioFormat =
        format.extension === "m4a" ||
        format.extension === "webm";

      if (!isAudioFormat) {
        continue;
      }

      const quality = getAudioQuality(format.bitrate ?? null);

      /*
       * Prefer m4a because it is easier to convert to MP3
       * with FFmpeg later.
       */
      if (
        format.extension === "m4a" &&
        !audioMap.has(quality)
      ) {
        audioMap.set(quality, {
          formatId: format.formatId,
          type: "audio",
          quality,
          extension: format.extension,
          bitrate: format.bitrate ?? null,
          fileSize: format.fileSize ?? null,
        });
      }
    }
  }

  const qualityOrder = [
    "2160p",
    "1440p",
    "1080p",
    "720p",
    "480p",
    "360p",
    "240p",
  ];

  const video = Array.from(videoMap.values()).sort(
    (a, b) =>
      qualityOrder.indexOf(a.quality) -
      qualityOrder.indexOf(b.quality)
  );

  const audio = Array.from(audioMap.values()).sort(
    (a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0)
  );

  return {
    video,
    audio,
  };
}
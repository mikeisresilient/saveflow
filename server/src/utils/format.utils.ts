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

function getAudioQuality(
  bitrate: number | null
): string {
  if (!bitrate) {
    return "Audio";
  }

  if (bitrate >= 300) return "320 kbps";
  if (bitrate >= 180) return "192 kbps";
  if (bitrate >= 120) return "128 kbps";
  if (bitrate >= 80) return "96 kbps";

  return `${Math.round(bitrate)} kbps`;
}

function hasVideo(
  format: RawFormat
): boolean {
  return Boolean(
    format.videoCodec &&
      format.videoCodec !== "none" &&
      format.width &&
      format.height &&
      format.width > 0 &&
      format.height > 0
  );
}

/*
 * IMPORTANT:
 *
 * Audio formats must be AUDIO ONLY.
 *
 * A format containing both video and audio
 * must never appear in the Audio Formats list.
 *
 * Example:
 *
 * h264 + aac = VIDEO format
 * none + aac = AUDIO ONLY format
 */
function hasAudio(
  format: RawFormat
): boolean {
  return Boolean(
    format.audioCodec &&
      format.audioCodec !== "none" &&
      (!format.videoCodec ||
        format.videoCodec === "none")
  );
}

function isUsableVideoExtension(
  extension: string
): boolean {
  const ext = extension.toLowerCase();

  return (
    ext === "mp4" ||
    ext === "webm" ||
    ext === "mov"
  );
}

function isUsableAudioExtension(
  extension: string
): boolean {
  const ext = extension.toLowerCase();

  return (
    ext === "m4a" ||
    ext === "webm" ||
    ext === "mp4" ||
    ext === "mp3"
  );
}

function getVideoScore(
  format: RawFormat
): number {
  const extension =
    format.extension.toLowerCase();

  const hasAudioStream =
    Boolean(
      format.audioCodec &&
        format.audioCodec !== "none"
    );

  let score = 0;

  /*
   * Prefer MP4 because the final SaveFlow
   * output is MP4.
   */
  if (extension === "mp4") {
    score += 100;
  }

  /*
   * Prefer a format that already contains
   * audio. This is especially important for
   * platforms where some formats are already
   * combined video + audio.
   */
  if (hasAudioStream) {
    score += 50;
  }

  /*
   * Prefer a format with a known file size.
   */
  if (format.fileSize) {
    score += 10;
  }

  /*
   * Prefer higher frame rates when the
   * resolution is otherwise identical.
   */
  if (format.fps) {
    score += Math.min(
      format.fps,
      60
    ) / 10;
  }

  return score;
}

function getAudioScore(
  format: RawFormat
): number {
  const extension =
    format.extension.toLowerCase();

  let score = 0;

  /*
   * M4A/AAC is preferred because FFmpeg can
   * reliably convert it to MP3.
   */
  if (extension === "m4a") {
    score += 100;
  } else if (extension === "webm") {
    score += 80;
  } else if (extension === "mp4") {
    score += 70;
  } else if (extension === "mp3") {
    score += 60;
  }

  /*
   * Prefer higher bitrate when comparing
   * otherwise equivalent audio formats.
   */
  score += Math.min(
    format.bitrate ?? 0,
    320
  ) / 10;

  return score;
}

export function processFormats(
  formats: RawFormat[]
): ProcessedFormats {
  const videoMap =
    new Map<string, VideoFormat>();

  const audioMap =
    new Map<string, AudioFormat>();

  for (const format of formats) {
    /*
     * ============================
     * VIDEO
     * ============================
     *
     * Any format containing a video
     * stream belongs in the Video list.
     *
     * This includes:
     *
     * video only
     * video + audio
     */
    if (
      hasVideo(format) &&
      isUsableVideoExtension(
        format.extension
      )
    ) {
      const quality =
        getVideoQuality(
          format.height!
        );

      const existing =
        videoMap.get(quality);

      const currentScore =
        getVideoScore(format);

      if (!existing) {
        videoMap.set(quality, {
          formatId:
            format.formatId,

          type: "video",

          quality,

          extension:
            format.extension.toLowerCase(),

          width:
            format.width!,

          height:
            format.height!,

          fps:
            format.fps ?? null,

          fileSize:
            format.fileSize ?? null,
        });
      } else {
        /*
         * Reconstruct the basic score of
         * the existing format.
         */
        const existingScore =
          getVideoScore({
            formatId:
              existing.formatId,

            extension:
              existing.extension,

            width:
              existing.width,

            height:
              existing.height,

            fps:
              existing.fps,

            fileSize:
              existing.fileSize,

            videoCodec:
              "video",

            /*
             * We don't know whether the stored
             * format contains audio, so this
             * remains null.
             */
            audioCodec:
              null,

            resolution:
              null,

            bitrate:
              null,
          });

        if (
          currentScore >
          existingScore
        ) {
          videoMap.set(quality, {
            formatId:
              format.formatId,

            type: "video",

            quality,

            extension:
              format.extension.toLowerCase(),

            width:
              format.width!,

            height:
              format.height!,

            fps:
              format.fps ?? null,

            fileSize:
              format.fileSize ?? null,
          });
        }
      }
    }

    /*
     * ============================
     * AUDIO ONLY
     * ============================
     *
     * IMPORTANT:
     *
     * hasAudio() now guarantees that
     * the format does NOT contain video.
     *
     * Therefore formats such as:
     *
     * h264_540p_431187-0
     *
     * will NOT be added to Audio.
     */
    if (
      hasAudio(format) &&
      isUsableAudioExtension(
        format.extension
      )
    ) {
      const quality =
        getAudioQuality(
          format.bitrate ?? null
        );

      const existing =
        audioMap.get(quality);

      if (!existing) {
        audioMap.set(quality, {
          formatId:
            format.formatId,

          type: "audio",

          quality,

          extension:
            format.extension.toLowerCase(),

          bitrate:
            format.bitrate ?? null,

          fileSize:
            format.fileSize ?? null,
        });
      } else {
        const currentScore =
          getAudioScore(format);

        const existingScore =
          getAudioScore({
            formatId:
              existing.formatId,

            extension:
              existing.extension,

            bitrate:
              existing.bitrate,

            fileSize:
              existing.fileSize,

            width:
              null,

            height:
              null,

            resolution:
              null,

            fps:
              null,

            videoCodec:
              null,

            audioCodec:
              "audio",
          });

        if (
          currentScore >
          existingScore
        ) {
          audioMap.set(quality, {
            formatId:
              format.formatId,

            type: "audio",

            quality,

            extension:
              format.extension.toLowerCase(),

            bitrate:
              format.bitrate ?? null,

            fileSize:
              format.fileSize ?? null,
          });
        }
      }
    }
  }

  /*
   * ============================
   * SORT VIDEO
   * ============================
   */

  const qualityOrder = [
    "2160p",
    "1440p",
    "1080p",
    "720p",
    "480p",
    "360p",
    "240p",
  ];

  const video =
    Array.from(
      videoMap.values()
    ).sort(
      (a, b) =>
        qualityOrder.indexOf(
          a.quality
        ) -
        qualityOrder.indexOf(
          b.quality
        )
    );

  /*
   * ============================
   * SORT AUDIO
   * ============================
   *
   * Highest bitrate first.
   */

  const audio =
    Array.from(
      audioMap.values()
    ).sort(
      (a, b) =>
        (b.bitrate ?? 0) -
        (a.bitrate ?? 0)
    );

  return {
    video,
    audio,
  };
}
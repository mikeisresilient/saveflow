import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

import { env } from "../../config/env.js";
import {
  MAX_DOWNLOAD_SIZE_BYTES,
} from "../../utils/limits.utils.js";

const execFileAsync = promisify(execFile);

export type DownloadType = "video" | "audio";

interface DownloadOptions {
  url: string;
  formatId: string;
  type: DownloadType;
}

interface DownloadResult {
  filePath: string;
  fileName: string;
  contentType: string;
}

interface ProbeResult {
  videoCodec: string | null;
  audioCodec: string | null;
}

export class DownloadError extends Error {
  statusCode: number;

  constructor(
    message: string,
    statusCode = 400
  ) {
    super(message);
    this.name = "DownloadError";
    this.statusCode = statusCode;
  }
}

function createTempDirectory(): string {
  return path.join(
    os.tmpdir(),
    "saveflow",
    crypto.randomUUID()
  );
}

function sanitizeFileName(name: string): string {
  const sanitized = name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);

  return sanitized || "saveflow-media";
}

const FFMPEG_PATH = env.ffmpegPath;

function getCommandErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const possibleError = error as {
      message?: string;
      stderr?: string;
      stdout?: string;
      killed?: boolean;
      signal?: string | null;
      code?: string | number;
    };

    return [
      possibleError.message,
      possibleError.stderr,
      possibleError.stdout,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return String(error);
}

function translateDownloadError(
  error: unknown
): DownloadError {
  if (error instanceof DownloadError) {
    return error;
  }

  const message =
    getCommandErrorMessage(error).toLowerCase();

  if (
    message.includes("timed out") ||
    message.includes("etimedout") ||
    message.includes("timeout") ||
    (
      typeof error === "object" &&
      error !== null &&
      "killed" in error &&
      (error as { killed?: boolean }).killed === true
    )
  ) {
    return new DownloadError(
      "The download took too long and was stopped. Try a shorter or smaller video.",
      408
    );
  }

  if (
    message.includes("private video") ||
    message.includes("private media") ||
    message.includes("this account is private")
  ) {
    return new DownloadError(
      "This media is private and cannot be downloaded.",
      403
    );
  }

  if (
    message.includes("login required") ||
    message.includes("sign in") ||
    message.includes("authentication") ||
    message.includes("cookies") ||
    message.includes("log in")
  ) {
    return new DownloadError(
      "This media requires authentication and cannot be downloaded.",
      403
    );
  }

  if (
    message.includes("video unavailable") ||
    message.includes("media unavailable") ||
    message.includes("not available")
  ) {
    return new DownloadError(
      "This media is unavailable.",
      404
    );
  }

  if (
    message.includes("unsupported url") ||
    message.includes("unsupported site") ||
    message.includes("no suitable extractor")
  ) {
    return new DownloadError(
      "SaveFlow does not currently support this media URL.",
      400
    );
  }

  if (
    message.includes("requested format is not available") ||
    message.includes("format is not available")
  ) {
    return new DownloadError(
      "The selected quality is no longer available. Analyze the media again and choose another format.",
      400
    );
  }

  if (
    message.includes("http error 403") ||
    message.includes("forbidden") ||
    message.includes("not a bot")
  ) {
    return new DownloadError(
      "The platform is currently blocking this automated request. Please try again later or use another supported URL.",
      503
    );
  }

  if (
    message.includes("ffmpeg") ||
    message.includes("ffprobe") ||
    message.includes("postprocessing")
  ) {
    return new DownloadError(
      "SaveFlow could not process this media file.",
      500
    );
  }

  console.error(
    "FULL DOWNLOAD ERROR:",
    getCommandErrorMessage(error)
  );

  return new DownloadError(
    "Unable to download this media right now.",
    500
  );
}

async function validateActualFileSize(
  filePath: string
): Promise<void> {
  const stats = await fs.stat(filePath);

  if (
    stats.size >
    MAX_DOWNLOAD_SIZE_BYTES
  ) {
    throw new DownloadError(
      "This download is too large. SaveFlow currently supports files up to 500 MB.",
      413
    );
  }
}

async function runYtDlp(args: string[], timeout: number): Promise<void> {
  const finalArgs = [
    "--js-runtimes",
    "deno",
    "--remote-components",
    "ejs:npm",
    "--extractor-args",
    "youtubepot-bgutilscript:server_home=/opt/bgutil-ytdlp-pot-provider/server",
    ...args,
  ];

  await execFileAsync(
    "python",
    [
      "-m",
      "yt_dlp",
      ...finalArgs,
    ],
    {
      maxBuffer: 10 * 1024 * 1024,
      timeout,
      windowsHide: true,
    }
  );
}

async function findDownloadedMedia(
  tempDir: string,
  extensions: string[]
): Promise<string | null> {
  const files = await fs.readdir(
    tempDir,
    { withFileTypes: true }
  );

  const candidates = files
    .filter(
      (entry) =>
        entry.isFile() &&
        extensions.some((extension) =>
          entry.name
            .toLowerCase()
            .endsWith(extension)
        )
    )
    .map((entry) =>
      path.join(tempDir, entry.name)
    );

  if (candidates.length === 0) {
    return null;
  }

  const filesWithStats = await Promise.all(
    candidates.map(async (filePath) => ({
      filePath,
      stats: await fs.stat(filePath),
    }))
  );

  filesWithStats.sort(
    (a, b) =>
      b.stats.mtimeMs -
      a.stats.mtimeMs
  );

  return filesWithStats[0].filePath;
}

async function probeMedia(
  filePath: string
): Promise<ProbeResult> {
  const { stdout } =
    await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type,codec_name",
        "-of",
        "json",
        filePath,
      ],
      {
        maxBuffer: 2 * 1024 * 1024,
        timeout: 30_000,
        windowsHide: true,
      }
    );

  const data = JSON.parse(stdout);

  const streams = Array.isArray(data.streams)
    ? data.streams
    : [];

  const videoStream = streams.find(
    (stream: {
      codec_type?: string;
    }) =>
      stream.codec_type === "video"
  );

  const audioStream = streams.find(
    (stream: {
      codec_type?: string;
    }) =>
      stream.codec_type === "audio"
  );

  return {
    videoCodec:
      videoStream?.codec_name ?? null,
    audioCodec:
      audioStream?.codec_name ?? null,
  };
}

async function normalizeVideoToCompatibleMp4(
  inputPath: string,
  outputPath: string
): Promise<void> {
  const probe = await probeMedia(inputPath);

  const videoIsCompatible =
    probe.videoCodec === "h264";

  const audioIsCompatible =
    probe.audioCodec === "aac";

  if (
    videoIsCompatible &&
    audioIsCompatible
  ) {
    await fs.rename(
      inputPath,
      outputPath
    );

    return;
  }

  const ffmpegArgs = [
    "-y",
    "-i",
    inputPath,

    "-map",
    "0:v:0",

    "-map",
    "0:a:0?",

    "-movflags",
    "+faststart",
  ];

  if (videoIsCompatible) {
    ffmpegArgs.push(
      "-c:v",
      "copy"
    );
  } else {
    ffmpegArgs.push(
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p"
    );
  }

  if (audioIsCompatible) {
    ffmpegArgs.push(
      "-c:a",
      "copy"
    );
  } else {
    ffmpegArgs.push(
      "-c:a",
      "aac",
      "-b:a",
      "192k"
    );
  }

  ffmpegArgs.push(
    outputPath
  );

  await execFileAsync(
    FFMPEG_PATH,
    ffmpegArgs,
    {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 5 * 60 * 1000,
      windowsHide: true,
    }
  );

  await fs.rm(
    inputPath,
    {
      force: true,
    }
  );
}

async function convertAudioToMp3(
  inputPath: string,
  outputPath: string
): Promise<void> {
  await execFileAsync(
    FFMPEG_PATH,
    [
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "192k",
      "-ar",
      "44100",
      "-ac",
      "2",
      outputPath,
    ],
    {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 5 * 60 * 1000,
      windowsHide: true,
    }
  );
}

export async function downloadMedia({
  url,
  formatId,
  type,
}: DownloadOptions): Promise<DownloadResult> {
  const tempDir =
    createTempDirectory();

  await fs.mkdir(
    tempDir,
    {
      recursive: true,
    }
  );

  try {
    const outputTemplate =
      path.join(
        tempDir,
        "%(title)s.%(ext)s"
      );

    if (type === "audio") {
      await runYtDlp(
        [
          "--no-playlist",
          "-f",
          formatId,
          "-o",
          outputTemplate,
          url,
        ],
        5 * 60 * 1000
      );

      const sourceFile = await findDownloadedMedia(
        tempDir,
        [
          ".mp3",
          ".m4a",
          ".webm",
          ".mp4",
          ".opus",
          ".aac",
        ]
      );

      if (!sourceFile) {
        throw new DownloadError(
          "SaveFlow could not find the downloaded audio file.",
          500
        );
      }

      const baseName = sanitizeFileName(
        path.parse(sourceFile).name
      );

      /*
       * If yt-dlp already produced MP3,
       * use it directly.
       *
       * TikTok's "audio" format does exactly this.
       */
      if (
        path.extname(sourceFile).toLowerCase() === ".mp3"
      ) {
        await validateActualFileSize(sourceFile);

        const finalPath = path.join(
          tempDir,
          `${baseName}.mp3`
        );

        if (sourceFile !== finalPath) {
          await fs.rename(
            sourceFile,
            finalPath
          );
        }

        return {
          filePath: finalPath,
          fileName: `${baseName}.mp3`,
          contentType: "audio/mpeg",
        };
      }

      /*
       * Other audio containers need conversion
       * to MP3.
       */
      const outputPath = path.join(
        tempDir,
        `${baseName}.mp3`
      );

      await convertAudioToMp3(
        sourceFile,
        outputPath
      );

      await validateActualFileSize(
        outputPath
      );

      return {
        filePath: outputPath,
        fileName: `${baseName}.mp3`,
        contentType: "audio/mpeg",
      };
    }

    await runYtDlp(
      [
        "--no-playlist",

        "-f",
        `${formatId}+bestaudio/best`,

        "--merge-output-format",
        "mkv",

        "-o",
        outputTemplate,

        url,
      ],
      5 * 60 * 1000
    );

    const sourceFile =
      await findDownloadedMedia(
        tempDir,
        [
          ".mkv",
          ".mp4",
          ".webm",
          ".mov",
        ]
      );

    if (!sourceFile) {
      throw new DownloadError(
        "SaveFlow could not find the downloaded video file.",
        500
      );
    }

    const baseName =
      sanitizeFileName(
        path.parse(sourceFile).name
      );

    const outputPath =
      path.join(
        tempDir,
        `${baseName}.mp4`
      );

    await normalizeVideoToCompatibleMp4(
      sourceFile,
      outputPath
    );

    await validateActualFileSize(
      outputPath
    );

    return {
      filePath: outputPath,
      fileName: `${baseName}.mp4`,
      contentType: "video/mp4",
    };
  } catch (error) {
    await fs.rm(
      tempDir,
      {
        recursive: true,
        force: true,
      }
    );

    throw translateDownloadError(
      error
    );
  }
}

export async function cleanupDownload(
  filePath: string
): Promise<void> {
  const tempDir =
    path.dirname(filePath);

  await fs.rm(
    tempDir,
    {
      recursive: true,
      force: true,
    }
  );
}

export function isValidFormatId(
  formatId: string,
  availableFormatIds: string[]
): boolean {
  return availableFormatIds.includes(
    formatId
  );
}
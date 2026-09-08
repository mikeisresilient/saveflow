import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
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
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
}

/*
 * FFmpeg directory.
 *
 * This directory contains:
 * ffmpeg.exe
 * ffprobe.exe
 *
 * The value can be overridden with FFMPEG_PATH
 * in the .env file.
 */
const FFMPEG_PATH =
  process.env.FFMPEG_PATH ||
  "C:\\Users\\HomePC\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-full_build\\bin";

function getCommandErrorMessage(
  error: unknown
): string {
  if (
    typeof error === "object" &&
    error !== null
  ) {
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
    message.includes("private media")
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
    message.includes("cookies")
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
    message.includes("ffmpeg") ||
    message.includes("ffprobe") ||
    message.includes("postprocessing")
  ) {
    return new DownloadError(
      "SaveFlow could not process this media file.",
      500
    );
  }

  return new DownloadError(
    "Unable to download this media right now.",
    500
  );
}

async function validateActualFileSize(
  filePath: string
): Promise<void> {
  const stats = await fs.stat(filePath);

  if (stats.size > MAX_DOWNLOAD_SIZE_BYTES) {
    throw new DownloadError(
      "This download is too large. SaveFlow currently supports files up to 500 MB.",
      413
    );
  }
}

export async function downloadMedia({
  url,
  formatId,
  type,
}: DownloadOptions): Promise<DownloadResult> {
  const tempDir = createTempDirectory();

  await fs.mkdir(tempDir, {
    recursive: true,
  });

  try {
    const outputTemplate = path.join(
      tempDir,
      "%(title)s.%(ext)s"
    );

    /*
     * AUDIO DOWNLOAD
     */
    if (type === "audio") {
      await execFileAsync(
        "python",
        [
          "-m",
          "yt_dlp",
          "--no-playlist",
          "-f",
          formatId,
          "--extract-audio",
          "--audio-format",
          "mp3",
          "--audio-quality",
          "192K",
          "--ffmpeg-location",
          FFMPEG_PATH,
          "-o",
          outputTemplate,
          url,
        ],
        {
          maxBuffer: 10 * 1024 * 1024,
          timeout: 5 * 60 * 1000,
          windowsHide: true,
        }
      );

      const files = await fs.readdir(
        tempDir
      );

      const audioFile = files.find(
        (file) =>
          file.toLowerCase().endsWith(".mp3")
      );

      if (!audioFile) {
        throw new DownloadError(
          "SaveFlow could not create the requested audio file.",
          500
        );
      }

      const audioPath = path.join(
        tempDir,
        audioFile
      );

      await validateActualFileSize(
        audioPath
      );

      const safeName =
        sanitizeFileName(
          path.parse(audioFile).name
        );

      return {
        filePath: audioPath,
        fileName: `${safeName}.mp3`,
        contentType: "audio/mpeg",
      };
    }

    /*
     * VIDEO DOWNLOAD
     *
     * Download the selected video format
     * together with the best available audio.
     *
     * Then use FFmpeg to create a browser
     * compatible MP4 containing:
     *
     * Video: H.264
     * Audio: AAC
     * Container: MP4
     */
    await execFileAsync(
      "python",
      [
        "-m",
        "yt_dlp",

        "--no-playlist",

        "-f",
        `${formatId}+bestaudio/best`,

        /*
         * Force MP4 as the final container.
         */
        "--merge-output-format",
        "mp4",

        /*
         * Convert/remux the result to MP4.
         */
        "--remux-video",
        "mp4",

        /*
         * Encode to codecs supported by
         * modern browsers and media players.
         */
        "--postprocessor-args",
        "Merger+ffmpeg:-c:v libx264 -c:a aac -b:a 192k",

        /*
         * FFmpeg location.
         */
        "--ffmpeg-location",
        FFMPEG_PATH,

        "-o",
        outputTemplate,

        url,
      ],
      {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 5 * 60 * 1000,
        windowsHide: true,
      }
    );

    const files = await fs.readdir(
      tempDir
    );

    const videoFile = files.find(
      (file) =>
        file.toLowerCase().endsWith(".mp4")
    );

    if (!videoFile) {
      throw new DownloadError(
        "SaveFlow could not create the requested video file.",
        500
      );
    }

    const videoPath = path.join(
      tempDir,
      videoFile
    );

    await validateActualFileSize(
      videoPath
    );

    const safeName =
      sanitizeFileName(
        path.parse(videoFile).name
      );

    return {
      filePath: videoPath,
      fileName: `${safeName}.mp4`,
      contentType: "video/mp4",
    };
  } catch (error) {
    await fs.rm(tempDir, {
      recursive: true,
      force: true,
    });

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

  await fs.rm(tempDir, {
    recursive: true,
    force: true,
  });
}

export function isValidFormatId(
  formatId: string,
  availableFormatIds: string[]
): boolean {
  return availableFormatIds.includes(
    formatId
  );
}
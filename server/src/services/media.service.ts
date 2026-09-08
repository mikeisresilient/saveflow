import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  processFormats,
  RawFormat,
} from "../utils/format.utils.js";

const execFileAsync = promisify(execFile);

export class MediaInfoError extends Error {
  statusCode: number;
  code: string;

  constructor(
    message: string,
    statusCode = 400,
    code = "MEDIA_INFO_ERROR"
  ) {
    super(message);
    this.name = "MediaInfoError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function getFriendlyMediaError(
  error: unknown
): MediaInfoError {
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  const lowerMessage =
    message.toLowerCase();

  /*
   * YouTube or another platform is
   * blocking automated requests.
   */
  if (
    lowerMessage.includes(
      "sign in to confirm"
    ) ||
    lowerMessage.includes(
      "not a bot"
    ) ||
    lowerMessage.includes(
      "http error 403"
    ) ||
    lowerMessage.includes(
      "cookies-from-browser"
    ) ||
    lowerMessage.includes(
      "cookies or authentication"
    ) ||
    lowerMessage.includes(
      "unable to download api page"
    )
  ) {
    return new MediaInfoError(
      "This platform is temporarily unavailable. The platform is currently blocking automated requests from SaveFlow. Please try another supported URL.",
      503,
      "PLATFORM_BLOCKED"
    );
  }

  /*
   * Private or unavailable media.
   */
  if (
    lowerMessage.includes(
      "video unavailable"
    ) ||
    lowerMessage.includes(
      "this video is unavailable"
    ) ||
    lowerMessage.includes(
      "private video"
    ) ||
    lowerMessage.includes(
      "content is not available"
    )
  ) {
    return new MediaInfoError(
      "This media is unavailable or private. Please check the URL and make sure the content is publicly accessible.",
      400,
      "MEDIA_UNAVAILABLE"
    );
  }

  /*
   * Unsupported platform or URL.
   */
  if (
    lowerMessage.includes(
      "unsupported url"
    ) ||
    lowerMessage.includes(
      "no suitable extractor"
    )
  ) {
    return new MediaInfoError(
      "SaveFlow could not recognize this URL. Please try a URL from a supported platform.",
      400,
      "UNSUPPORTED_URL"
    );
  }

  /*
   * Network or timeout problems.
   */
  if (
    lowerMessage.includes(
      "timed out"
    ) ||
    lowerMessage.includes(
      "timeout"
    ) ||
    lowerMessage.includes(
      "connection reset"
    ) ||
    lowerMessage.includes(
      "network is unreachable"
    ) ||
    lowerMessage.includes(
      "temporary failure"
    )
  ) {
    return new MediaInfoError(
      "The platform took too long to respond. Please try again in a moment.",
      504,
      "PLATFORM_TIMEOUT"
    );
  }

  /*
   * Unexpected response from the extractor.
   */
  if (
    lowerMessage.includes(
      "unexpected token"
    ) ||
    lowerMessage.includes(
      "json.parse"
    )
  ) {
    return new MediaInfoError(
      "SaveFlow could not read the media information from this URL. Please try again or use another supported URL.",
      502,
      "INVALID_MEDIA_RESPONSE"
    );
  }

  /*
   * Safe generic fallback.
   *
   * Do not expose the raw yt-dlp command
   * or internal server information.
   */
  return new MediaInfoError(
    "Unable to analyze this media URL right now. Please check the URL and try again.",
    400,
    "MEDIA_INFO_ERROR"
  );
}

export async function getMediaInfo(
  url: string
) {
  try {
    const { stdout } =
      await execFileAsync(
        "python",
        [
          "-m",
          "yt_dlp",
          "--dump-single-json",
          "--skip-download",
          "--no-playlist",
          url,
        ],
        {
          maxBuffer:
            10 * 1024 * 1024,
          timeout: 30_000,
          windowsHide: true,
        }
      );

    const data =
      JSON.parse(stdout);

    const rawFormats: RawFormat[] =
      Array.isArray(data.formats)
        ? data.formats.map(
            (format: any) => ({
              formatId:
                format.format_id,

              extension:
                format.ext,

              width:
                format.width,

              height:
                format.height,

              resolution:
                format.resolution,

              fps:
                format.fps,

              videoCodec:
                format.vcodec,

              audioCodec:
                format.acodec,

              fileSize:
                format.filesize ??
                format.filesize_approx ??
                null,

              bitrate:
                format.tbr,
            })
          )
        : [];

    const formats =
      processFormats(
        rawFormats
      );

    return {
      id: data.id,
      title: data.title,
      description:
        data.description,
      thumbnail:
        data.thumbnail,
      duration:
        data.duration,
      uploader:
        data.uploader,
      webpageUrl:
        data.webpage_url,
      extractor:
        data.extractor,
      formats,
    };
  } catch (error) {
    /*
     * Keep the technical error in Render
     * logs for debugging.
     */
    console.error(
      "yt-dlp media info error:",
      error
    );

    /*
     * Return only a safe, user-friendly
     * error to the route.
     */
    throw getFriendlyMediaError(
      error
    );
  }
}
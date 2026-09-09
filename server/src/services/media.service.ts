import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  processFormats,
  RawFormat,
} from "../utils/format.utils.js";

const execFileAsync =
  promisify(execFile);

export class MediaInfoError extends Error {
  statusCode: number;
  code: string;

  constructor(
    message: string,
    statusCode = 400,
    code = "MEDIA_INFO_ERROR"
  ) {
    super(message);

    this.name =
      "MediaInfoError";

    this.statusCode =
      statusCode;

    this.code =
      code;
  }
}

function getFriendlyMediaError(
  error: unknown
): MediaInfoError {
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  const lower =
    message.toLowerCase();

  if (
    lower.includes(
      "sign in to confirm"
    ) ||
    lower.includes(
      "not a bot"
    ) ||
    lower.includes(
      "http error 403"
    ) ||
    lower.includes(
      "http error 429"
    ) ||
    lower.includes(
      "cookies-from-browser"
    ) ||
    lower.includes(
      "po token"
    ) ||
    lower.includes(
      "botguard"
    )
  ) {
    return new MediaInfoError(
      "This platform is currently blocking automated requests from SaveFlow. Please try again later or use another supported URL.",
      503,
      "PLATFORM_BLOCKED"
    );
  }

  if (
    lower.includes(
      "video unavailable"
    ) ||
    lower.includes(
      "this video is unavailable"
    ) ||
    lower.includes(
      "private video"
    ) ||
    lower.includes(
      "private media"
    ) ||
    lower.includes(
      "content is not available"
    ) ||
    lower.includes(
      "media unavailable"
    )
  ) {
    return new MediaInfoError(
      "This media is unavailable or private. Please check the URL and make sure the content is publicly accessible.",
      400,
      "MEDIA_UNAVAILABLE"
    );
  }

  if (
    lower.includes(
      "unsupported url"
    ) ||
    lower.includes(
      "no suitable extractor"
    ) ||
    lower.includes(
      "unsupported site"
    )
  ) {
    return new MediaInfoError(
      "SaveFlow could not recognize this URL. Please try a URL from a supported platform.",
      400,
      "UNSUPPORTED_URL"
    );
  }

  if (
    lower.includes(
      "timed out"
    ) ||
    lower.includes(
      "timeout"
    ) ||
    lower.includes(
      "connection reset"
    ) ||
    lower.includes(
      "network is unreachable"
    ) ||
    lower.includes(
      "temporary failure"
    ) ||
    lower.includes(
      "unable to connect"
    )
  ) {
    return new MediaInfoError(
      "The platform took too long to respond. Please try again in a moment.",
      504,
      "PLATFORM_TIMEOUT"
    );
  }

  if (
    lower.includes(
      "unexpected token"
    ) ||
    lower.includes(
      "json.parse"
    ) ||
    lower.includes(
      "invalid json"
    )
  ) {
    return new MediaInfoError(
      "SaveFlow could not read the media information from this URL. Please try again or use another supported URL.",
      502,
      "INVALID_MEDIA_RESPONSE"
    );
  }

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

          /*
           * Let yt-dlp verify that the formats
           * are actually reachable.
           */
          "--check-formats",

          /*
           * Deno is installed in the production
           * Docker image and is the recommended
           * JS runtime for yt-dlp EJS.
           */
          "--js-runtimes",
          "deno",

          /*
           * Allow yt-dlp to obtain the current
           * EJS challenge scripts when needed.
           */
          "--remote-components",
          "ejs:npm",
          "--verbose",

          /*
           * Use the BgUtils PO Token provider.
           *
           * The provider is built into the production
           * Docker image at this location.
           */
          "--extractor-args",
          "youtubepot-bgutilscript:server_home=/opt/bgutil-ytdlp-pot-provider/server",

          url,
        ],
        {
          maxBuffer:
            20 * 1024 * 1024,

          timeout:
            60_000,

          windowsHide:
            true,
        }
      );

    const data =
      JSON.parse(stdout);

    const rawFormats: RawFormat[] =
      Array.isArray(
        data.formats
      )
        ? data.formats
            .map(
              (format: any) => ({
                formatId:
                  String(
                    format.format_id
                  ),

                extension:
                  String(
                    format.ext || ""
                  ),

                width:
                  format.width ??
                  null,

                height:
                  format.height ??
                  null,

                resolution:
                  format.resolution ??
                  null,

                fps:
                  format.fps ??
                  null,

                videoCodec:
                  format.vcodec ??
                  null,

                audioCodec:
                  format.acodec ??
                  null,

                fileSize:
                  format.filesize ??
                  format.filesize_approx ??
                  null,

                bitrate:
                  format.abr ??
                  format.tbr ??
                  null,
              })
            )
            .filter(
              (format: RawFormat) =>
                Boolean(
                  format.formatId
                )
            )
        : [];

    const formats =
      processFormats(
        rawFormats
      );

    return {
      id:
        data.id,

      title:
        data.title ||
        "Untitled media",

      description:
        data.description ||
        null,

      thumbnail:
        data.thumbnail ||
        null,

      duration:
        data.duration ??
        null,

      uploader:
        data.uploader ||
        data.channel ||
        null,

      webpageUrl:
        data.webpage_url ||
        url,

      extractor:
        data.extractor ||
        null,

      formats,
    };
  } catch (error) {
    console.error(
      "yt-dlp media info error:",
      error
    );

    throw getFriendlyMediaError(
      error
    );
  }
}
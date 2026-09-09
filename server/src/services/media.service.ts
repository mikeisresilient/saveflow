import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  processFormats,
  RawFormat,
} from "../utils/format.utils.js";

import {
  validateMediaUrl,
} from "../utils/url.utils.js";

const execFileAsync =
  promisify(execFile);

const FACEBOOK_HOSTNAMES =
  new Set([
    "facebook.com",
    "www.facebook.com",
    "m.facebook.com",
    "web.facebook.com",
  ]);

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

function isFacebookHostname(
  hostname: string
): boolean {
  return FACEBOOK_HOSTNAMES.has(
    hostname.toLowerCase()
  );
}

function isFacebookShareUrl(
  url: URL
): boolean {
  if (
    !isFacebookHostname(
      url.hostname
    )
  ) {
    return false;
  }

  const pathname =
    url.pathname.toLowerCase();

  return (
    pathname === "/share" ||
    pathname.startsWith(
      "/share/"
    )
  );
}

function isFacebookMediaUrl(
  url: URL
): boolean {
  if (
    !isFacebookHostname(
      url.hostname
    )
  ) {
    return false;
  }

  const pathname =
    url.pathname.toLowerCase();

  return (
    pathname.startsWith(
      "/reel/"
    ) ||
    pathname.startsWith(
      "/watch"
    ) ||
    pathname.includes(
      "/videos/"
    )
  );
}

function extractFacebookMediaUrl(
  value: string
): URL | null {
  /*
   * Facebook Reel
   *
   * Example:
   *
   * https://www.facebook.com/reel/1045549397960163/
   */
  const reelMatch =
    value.match(
      /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/reel\/(\d+)/i
    );

  if (reelMatch?.[1]) {
    return new URL(
      `https://www.facebook.com/reel/${reelMatch[1]}/`
    );
  }

  /*
   * Facebook Watch
   *
   * Example:
   *
   * https://www.facebook.com/watch/?v=123456789
   */
  const watchMatch =
    value.match(
      /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/watch\/?(?:\?[^"'<>]*?\bv=)(\d+)/i
    );

  if (watchMatch?.[1]) {
    return new URL(
      `https://www.facebook.com/watch/?v=${watchMatch[1]}`
    );
  }

  /*
   * Facebook video URL.
   */
  const videoMatch =
    value.match(
      /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/[^"'<>\/\s]+\/videos\/(\d+)/i
    );

  if (videoMatch?.[1]) {
    return new URL(
      `https://www.facebook.com/watch/?v=${videoMatch[1]}`
    );
  }

  /*
   * Also handle relative Facebook paths.
   */
  const relativeReelMatch =
    value.match(
      /\/reel\/(\d+)/i
    );

  if (relativeReelMatch?.[1]) {
    return new URL(
      `https://www.facebook.com/reel/${relativeReelMatch[1]}/`
    );
  }

  const relativeWatchMatch =
    value.match(
      /\/watch\/?(?:\?[^"'<>]*?\bv=)(\d+)/i
    );

  if (relativeWatchMatch?.[1]) {
    return new URL(
      `https://www.facebook.com/watch/?v=${relativeWatchMatch[1]}`
    );
  }

  return null;
}

async function resolveFacebookShareUrl(
  url: URL
): Promise<URL> {
  if (!isFacebookShareUrl(url)) {
    return url;
  }

  console.log(
    "Resolving Facebook share URL:",
    url.toString()
  );

  try {
    /*
     * Facebook reliably exposes the canonical Reel
     * through the first HTTP redirect.
     *
     * We intentionally DO NOT use -L here because
     * we want the first Location header, not the
     * final page after Facebook redirects further.
     *
     * This matches the curl test we already performed:
     *
     * /share/r/1BX6cVVLjm/
     *
     * ->
     *
     * /reel/1045549397960163/
     */
    const { stdout } =
      await execFileAsync(
        "curl",
        [
          "-sS",

          "-I",

          "--max-redirs",
          "0",

          "--connect-timeout",
          "10",

          "--max-time",
          "15",

          "-A",
          "curl/8.0.0",

          url.toString(),
        ],
        {
          maxBuffer:
            2 * 1024 * 1024,

          timeout:
            20_000,

          windowsHide:
            true,
        }
      );

    console.log(
      "Facebook redirect headers:",
      stdout
    );

    /*
     * HTTP header names are case-insensitive.
     *
     * Extract the first Location header.
     */
    const locationMatch =
      stdout.match(
        /^location:\s*(.+)$/im
      );

    if (!locationMatch?.[1]) {
      console.log(
        "Facebook share URL did not return a Location header."
      );

      return url;
    }

    const location =
      locationMatch[1].trim();

    console.log(
      "Facebook redirect location:",
      location
    );

    let redirectedUrl: URL;

    try {
      redirectedUrl =
        new URL(
          location,
          url
        );
    } catch {
      console.error(
        "Facebook returned an invalid redirect URL."
      );

      return url;
    }

    /*
     * Security:
     *
     * Only HTTP/HTTPS redirects are accepted.
     */
    if (
      !["http:", "https:"].includes(
        redirectedUrl.protocol
      )
    ) {
      console.error(
        "Facebook returned a non-HTTP redirect."
      );

      return url;
    }

    /*
     * Security:
     *
     * Never follow redirects containing
     * embedded credentials.
     */
    if (
      redirectedUrl.username ||
      redirectedUrl.password
    ) {
      console.error(
        "Facebook returned a redirect containing credentials."
      );

      return url;
    }

    /*
     * Security:
     *
     * The share URL must resolve to Facebook.
     * Do not allow Facebook's redirect mechanism
     * to turn this into an arbitrary external URL.
     */
    if (
      !isFacebookHostname(
        redirectedUrl.hostname
      )
    ) {
      console.error(
        "Facebook share URL redirected to an unexpected host:",
        redirectedUrl.hostname
      );

      return url;
    }

    /*
     * If Facebook gave us the Reel directly,
     * use it.
     */
    if (
      isFacebookMediaUrl(
        redirectedUrl
      )
    ) {
      const validated =
        await validateMediaUrl(
          redirectedUrl.toString()
        );

      console.log(
        "Resolved Facebook media URL:",
        validated.toString()
      );

      return validated;
    }

    /*
     * Some Facebook redirects may contain a
     * recognizable Reel/Watch URL inside them.
     */
    const extracted =
      extractFacebookMediaUrl(
        redirectedUrl.toString()
      );

    if (extracted) {
      const validated =
        await validateMediaUrl(
          extracted.toString()
        );

      console.log(
        "Extracted Facebook media URL:",
        validated.toString()
      );

      return validated;
    }

    /*
     * Handle a Facebook login redirect containing
     * a `next=` parameter.
     */
    if (
      redirectedUrl.pathname ===
        "/login" ||
      redirectedUrl.pathname ===
        "/login/"
    ) {
      const next =
        redirectedUrl.searchParams.get(
          "next"
        );

      if (next) {
        const nextMedia =
          extractFacebookMediaUrl(
            next
          );

        if (nextMedia) {
          const validated =
            await validateMediaUrl(
              nextMedia.toString()
            );

          console.log(
            "Resolved Facebook login redirect:",
            validated.toString()
          );

          return validated;
        }
      }
    }

    console.log(
      "Facebook redirect was not recognized:",
      redirectedUrl.toString()
    );

    return url;
  } catch (error) {
    console.error(
      "Facebook share URL resolution failed:",
      error
    );

    return url;
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
    /*
     * First validate the URL using the existing
     * SSRF protection.
     */
    const validatedUrl =
      await validateMediaUrl(
        url
      );

    /*
     * IMPORTANT:
     *
     * Explicitly resolve Facebook share URLs
     * BEFORE invoking yt-dlp.
     */
    const mediaUrl =
      await resolveFacebookShareUrl(
        validatedUrl
      );

    /*
     * This is the URL that will actually be
     * handed to yt-dlp.
     */
    console.log(
      "SaveFlow media URL:",
      mediaUrl.toString()
    );

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
           * Deno is installed in production.
           */
          "--js-runtimes",
          "deno",

          /*
           * Allow yt-dlp to obtain current
           * EJS challenge scripts.
           */
          "--remote-components",
          "ejs:npm",

          /*
           * BgUtils PO Token provider.
           */
          "--extractor-args",
          "youtubepot-bgutilscript:server_home=/opt/bgutil-ytdlp-pot-provider/server",

          /*
           * CRITICAL:
           *
           * Use the resolved URL, NOT the original
           * Facebook /share/r/ URL.
           */
          mediaUrl.toString(),
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
        mediaUrl.toString(),

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
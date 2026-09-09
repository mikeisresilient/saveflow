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
  /*
   * Only Facebook share URLs need special
   * handling.
   */
  if (
    !isFacebookShareUrl(url)
  ) {
    return url;
  }

  /*
   * The important part:
   *
   * Facebook's HEAD request gives us the
   * canonical Reel URL.
   *
   * We verified this behavior with:
   *
   * curl -I -L
   *
   * which returned:
   *
   * /share/r/1BX6cVVLjm/
   *
   * ->
   *
   * /reel/1045549397960163/
   */

  const candidates = [
    url,
    new URL(
      url.toString().replace(
        /^https?:\/\/www\.facebook\.com/i,
        "https://m.facebook.com"
      )
    ),
    new URL(
      url.toString().replace(
        /^https?:\/\/www\.facebook\.com/i,
        "https://web.facebook.com"
      )
    ),
  ];

  const uniqueCandidates =
    Array.from(
      new Map(
        candidates.map(
          (candidate) => [
            candidate.toString(),
            candidate,
          ]
        )
      ).values()
    );

  for (
    const candidate
    of uniqueCandidates
  ) {
    try {
      /*
       * HEAD is intentional.
       *
       * Facebook gave the canonical Reel
       * location when tested with curl -I.
       */
      const response =
        await fetch(
          candidate.toString(),
          {
            method: "HEAD",

            /*
             * Do NOT follow the redirect.
             *
             * We need the Location header.
             */
            redirect: "manual",

            headers: {
              "User-Agent":
                "curl/8.0.0",

              Accept:
                "*/*",
            },

            signal:
              AbortSignal.timeout(
                10_000
              ),
          }
        );

      const location =
        response.headers.get(
          "location"
        );

      if (!location) {
        continue;
      }

      let redirectedUrl: URL;

      try {
        redirectedUrl =
          new URL(
            location,
            candidate
          );
      } catch {
        continue;
      }

      /*
       * Security boundary:
       *
       * Only HTTP/HTTPS is allowed.
       */
      if (
        !["http:", "https:"].includes(
          redirectedUrl.protocol
        )
      ) {
        continue;
      }

      /*
       * Never allow credentials.
       */
      if (
        redirectedUrl.username ||
        redirectedUrl.password
      ) {
        continue;
      }

      /*
       * Never allow Facebook to turn this into
       * an arbitrary external redirect.
       */
      if (
        !isFacebookHostname(
          redirectedUrl.hostname
        )
      ) {
        continue;
      }

      /*
       * Direct canonical media URL.
       *
       * Example:
       *
       * https://www.facebook.com/reel/1045549397960163/
       */
      if (
        isFacebookMediaUrl(
          redirectedUrl
        )
      ) {
        /*
         * Run our existing SSRF validation
         * against the resolved URL.
         */
        const validated =
          await validateMediaUrl(
            redirectedUrl.toString()
          );

        return validated;
      }

      /*
       * Sometimes the redirect URL contains
       * a media ID even if its path isn't one
       * of our known canonical paths.
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

        return validated;
      }

      /*
       * Handle:
       *
       * /login/?next=https://facebook.com/reel/123
       *
       * This is not expected to be necessary for
       * the HEAD behavior we verified, but keeping
       * this fallback makes the resolver more robust.
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

            return validated;
          }
        }
      }
    } catch {
      /*
       * Try the next Facebook hostname.
       */
      continue;
    }
  }

  /*
   * If HEAD did not resolve the URL, try GET
   * as a fallback.
   */
  for (
    const candidate
    of uniqueCandidates
  ) {
    try {
      const response =
        await fetch(
          candidate.toString(),
          {
            method: "GET",
            redirect: "manual",

            headers: {
              "User-Agent":
                "curl/8.0.0",

              Accept:
                "text/html,application/xhtml+xml,*/*;q=0.8",
            },

            signal:
              AbortSignal.timeout(
                10_000
              ),
          }
        );

      const location =
        response.headers.get(
          "location"
        );

      if (location) {
        let redirectedUrl: URL;

        try {
          redirectedUrl =
            new URL(
              location,
              candidate
            );
        } catch {
          continue;
        }

        if (
          !isFacebookHostname(
            redirectedUrl.hostname
          )
        ) {
          continue;
        }

        if (
          !["http:", "https:"].includes(
            redirectedUrl.protocol
          )
        ) {
          continue;
        }

        if (
          redirectedUrl.username ||
          redirectedUrl.password
        ) {
          continue;
        }

        /*
         * Direct Reel destination.
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

          return validated;
        }

        /*
         * Extract media ID from redirect.
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

          return validated;
        }

        /*
         * Handle login/?next=...
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

              return validated;
            }
          }
        }
      }

      /*
       * If Facebook returned HTML, inspect
       * canonical/Open Graph URLs.
       */
      const contentType =
        response.headers.get(
          "content-type"
        ) ?? "";

      if (
        contentType.includes(
          "text/html"
        ) ||
        contentType.includes(
          "application/xhtml+xml"
        )
      ) {
        const html =
          await response.text();

        const patterns = [
          /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,

          /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i,

          /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i,

          /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:url["']/i,
        ];

        for (
          const pattern
          of patterns
        ) {
          const match =
            html.match(pattern);

          if (!match?.[1]) {
            continue;
          }

          const mediaUrl =
            extractFacebookMediaUrl(
              match[1]
            );

          if (mediaUrl) {
            const validated =
              await validateMediaUrl(
                mediaUrl.toString()
              );

            return validated;
          }
        }

        /*
         * Last HTML fallback: search the entire
         * response for a Facebook Reel URL.
         */
        const mediaUrl =
          extractFacebookMediaUrl(
            html
          );

        if (mediaUrl) {
          const validated =
            await validateMediaUrl(
              mediaUrl.toString()
            );

          return validated;
        }
      }
    } catch {
      continue;
    }
  }

  /*
   * No canonical destination was found.
   *
   * Return the original URL so yt-dlp can make
   * its own attempt.
   */
  return url;
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
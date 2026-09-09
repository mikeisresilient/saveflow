import dns from "node:dns/promises";
import net from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
]);

const FACEBOOK_HOSTNAMES = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "web.facebook.com",
]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);

  if (
    parts.length !== 4 ||
    parts.some(
      (part) =>
        !Number.isInteger(part) ||
        part < 0 ||
        part > 255
    )
  ) {
    return false;
  }

  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip
    .toLowerCase()
    .split("%")[0];

  if (
    normalized === "::1" ||
    normalized === "::"
  ) {
    return true;
  }

  if (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  ) {
    return true;
  }

  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }

  return false;
}

function isBlockedIp(ip: string): boolean {
  const version = net.isIP(ip);

  if (version === 4) {
    return isPrivateIPv4(ip);
  }

  if (version === 6) {
    return isPrivateIPv6(ip);
  }

  return false;
}

function isIPv4MappedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  return (
    normalized.startsWith("::ffff:") &&
    net.isIP(normalized.substring(7)) === 4
  );
}

function isBlockedAddress(address: string): boolean {
  if (isBlockedIp(address)) {
    return true;
  }

  if (isIPv4MappedIPv6(address)) {
    const ipv4 = address
      .toLowerCase()
      .substring(7);

    return isPrivateIPv4(ipv4);
  }

  return false;
}

async function validateHostname(
  hostname: string
): Promise<void> {
  const normalizedHostname =
    hostname.toLowerCase();

  if (!normalizedHostname) {
    throw new Error(
      "The provided URL has no hostname."
    );
  }

  if (
    BLOCKED_HOSTNAMES.has(
      normalizedHostname
    )
  ) {
    throw new Error(
      "Local and internal URLs are not allowed."
    );
  }

  if (
    isBlockedAddress(
      normalizedHostname
    )
  ) {
    throw new Error(
      "Private and internal IP addresses are not allowed."
    );
  }

  if (net.isIP(normalizedHostname)) {
    return;
  }

  try {
    const addresses =
      await dns.lookup(
        normalizedHostname,
        {
          all: true,
          verbatim: true,
        }
      );

    if (!addresses.length) {
      throw new Error(
        "Unable to resolve the media host."
      );
    }

    for (const address of addresses) {
      if (
        isBlockedAddress(
          address.address
        )
      ) {
        throw new Error(
          "The provided URL resolves to a private or internal network."
        );
      }
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (
        error.message.includes(
          "private or internal network"
        ) ||
        error.message.includes(
          "Unable to resolve the media host"
        )
      )
    ) {
      throw error;
    }

    throw new Error(
      "Unable to resolve the media host."
    );
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
    pathname.startsWith("/share/")
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
    pathname.startsWith("/reel/") ||
    pathname.startsWith("/watch") ||
    pathname.includes("/videos/")
  );
}

function buildFacebookReelUrl(
  id: string
): URL {
  return new URL(
    `https://www.facebook.com/reel/${id}/`
  );
}

function buildFacebookWatchUrl(
  id: string
): URL {
  return new URL(
    `https://www.facebook.com/watch/?v=${id}`
  );
}

function extractFacebookMediaId(
  value: string
): URL | null {
  /*
   * Facebook Reel:
   *
   * /reel/1045549397960163/
   */
  const reelMatch =
    value.match(
      /\/reel\/(\d+)/i
    );

  if (reelMatch?.[1]) {
    return buildFacebookReelUrl(
      reelMatch[1]
    );
  }

  /*
   * Facebook Watch:
   *
   * /watch/?v=123456789
   */
  const watchMatch =
    value.match(
      /\/watch\/?(?:\?[^"'<>]*?\bv=)(\d+)/i
    );

  if (watchMatch?.[1]) {
    return buildFacebookWatchUrl(
      watchMatch[1]
    );
  }

  /*
   * Facebook videos:
   *
   * /some-page/videos/123456789/
   */
  const videosMatch =
    value.match(
      /\/videos\/(\d+)/i
    );

  if (videosMatch?.[1]) {
    return buildFacebookWatchUrl(
      videosMatch[1]
    );
  }

  return null;
}

function extractFacebookMediaUrl(
  value: string
): URL | null {
  /*
   * Search for a complete Facebook Reel URL.
   */
  const reelMatch =
    value.match(
      /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/reel\/(\d+)/i
    );

  if (reelMatch?.[1]) {
    return buildFacebookReelUrl(
      reelMatch[1]
    );
  }

  /*
   * Search for a complete Facebook Watch URL.
   */
  const watchMatch =
    value.match(
      /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/watch\/?(?:\?[^"'<>]*?\bv=)(\d+)/i
    );

  if (watchMatch?.[1]) {
    return buildFacebookWatchUrl(
      watchMatch[1]
    );
  }

  /*
   * Search for Facebook video URLs.
   */
  const videosMatch =
    value.match(
      /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/[^"'<>\/\s]+\/videos\/(\d+)/i
    );

  if (videosMatch?.[1]) {
    return buildFacebookWatchUrl(
      videosMatch[1]
    );
  }

  /*
   * Fallback to relative Facebook paths.
   */
  return extractFacebookMediaId(
    value
  );
}

function extractCanonicalFromHtml(
  html: string
): URL | null {
  /*
   * Canonical link.
   */
  const canonicalPatterns = [
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,

    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i,

    /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i,

    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:url["']/i,
  ];

  for (const pattern of canonicalPatterns) {
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
      return mediaUrl;
    }
  }

  /*
   * Search the complete HTML as a fallback.
   */
  const directMedia =
    extractFacebookMediaUrl(
      html
    );

  if (directMedia) {
    return directMedia;
  }

  return null;
}

function extractRedirectMediaUrl(
  location: string,
  baseUrl: URL
): URL | null {
  let redirectedUrl: URL;

  try {
    redirectedUrl =
      new URL(
        location,
        baseUrl
      );
  } catch {
    return null;
  }

  /*
   * Only HTTP and HTTPS.
   */
  if (
    !["http:", "https:"].includes(
      redirectedUrl.protocol
    )
  ) {
    return null;
  }

  /*
   * Never allow credentials.
   */
  if (
    redirectedUrl.username ||
    redirectedUrl.password
  ) {
    return null;
  }

  /*
   * Only Facebook destinations are allowed.
   */
  if (
    !isFacebookHostname(
      redirectedUrl.hostname
    )
  ) {
    return null;
  }

  /*
   * Best case:
   *
   * /share/r/ABC
   *       ↓
   * /reel/123456789
   */
  if (
    isFacebookMediaUrl(
      redirectedUrl
    )
  ) {
    return redirectedUrl;
  }

  /*
   * Extract a media ID if the URL contains one.
   */
  const mediaUrl =
    extractFacebookMediaId(
      redirectedUrl.toString()
    );

  if (mediaUrl) {
    return mediaUrl;
  }

  /*
   * Handle Facebook login redirects.
   *
   * Example:
   *
   * /login/?next=https://www.facebook.com/reel/123/
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
      try {
        const nextUrl =
          new URL(next);

        if (
          !isFacebookHostname(
            nextUrl.hostname
          )
        ) {
          return null;
        }

        if (
          isFacebookMediaUrl(
            nextUrl
          )
        ) {
          return nextUrl;
        }

        const nextMediaUrl =
          extractFacebookMediaId(
            nextUrl.toString()
          );

        if (nextMediaUrl) {
          return nextMediaUrl;
        }
      } catch {
        // Ignore malformed next parameter.
      }
    }
  }

  return null;
}

async function resolveFacebookShareUrl(
  url: URL
): Promise<URL> {
  if (!isFacebookShareUrl(url)) {
    return url;
  }

  /*
   * IMPORTANT:
   *
   * Facebook responds to HEAD requests with the
   * canonical Reel URL for the share link.
   *
   * We discovered this behavior directly from:
   *
   * curl -I -L
   *
   * which returned:
   *
   * /share/r/1BX6cVVLjm/
   *       ↓
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

  /*
   * Remove duplicates.
   */
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

  /*
   * -----------------------------------------------
   * PASS 1
   * HEAD request
   * -----------------------------------------------
   */
  for (const candidate of uniqueCandidates) {
    await validateHostname(
      candidate.hostname
    );

    try {
      const response =
        await fetch(
          candidate.toString(),
          {
            method: "HEAD",
            redirect: "manual",
            headers: {
              /*
               * curl-like user agent.
               *
               * Facebook gave us the canonical Reel
               * URL using this request behavior.
               */
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

      const mediaUrl =
        extractRedirectMediaUrl(
          location,
          candidate
        );

      if (!mediaUrl) {
        continue;
      }

      await validateHostname(
        mediaUrl.hostname
      );

      return mediaUrl;
    } catch {
      /*
       * Try the next Facebook candidate.
       */
      continue;
    }
  }

  /*
   * -----------------------------------------------
   * PASS 2
   * GET request
   * -----------------------------------------------
   *
   * HEAD is preferred, but GET remains as a fallback
   * for Facebook configurations where HEAD doesn't
   * expose the redirect.
   */
  for (const candidate of uniqueCandidates) {
    await validateHostname(
      candidate.hostname
    );

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

      /*
       * Check redirect first.
       */
      if (location) {
        const mediaUrl =
          extractRedirectMediaUrl(
            location,
            candidate
          );

        if (mediaUrl) {
          await validateHostname(
            mediaUrl.hostname
          );

          return mediaUrl;
        }
      }

      /*
       * Check HTML if Facebook returned a page.
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

        const mediaUrl =
          extractCanonicalFromHtml(
            html
          );

        if (mediaUrl) {
          await validateHostname(
            mediaUrl.hostname
          );

          return mediaUrl;
        }
      }
    } catch {
      continue;
    }
  }

  /*
   * -----------------------------------------------
   * FINAL FALLBACK
   * -----------------------------------------------
   *
   * If Facebook does not expose the canonical URL,
   * leave the original URL untouched.
   *
   * This is safer than inventing a destination.
   */
  return url;
}

export async function validateMediaUrl(
  value: string
): Promise<URL> {
  if (
    !value ||
    typeof value !== "string"
  ) {
    throw new Error(
      "A valid media URL is required."
    );
  }

  if (value.length > 2048) {
    throw new Error(
      "The provided URL is too long."
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl =
      new URL(value);
  } catch {
    throw new Error(
      "The provided URL is invalid."
    );
  }

  /*
   * Only HTTP(S).
   */
  if (
    !["http:", "https:"].includes(
      parsedUrl.protocol
    )
  ) {
    throw new Error(
      "Only HTTP and HTTPS URLs are allowed."
    );
  }

  /*
   * Block username/password credentials.
   */
  if (
    parsedUrl.username ||
    parsedUrl.password
  ) {
    throw new Error(
      "URLs containing credentials are not allowed."
    );
  }

  /*
   * Validate the original hostname before
   * resolving redirects.
   */
  await validateHostname(
    parsedUrl.hostname
  );

  /*
   * Resolve Facebook share URLs.
   *
   * Normal URLs are returned unchanged.
   */
  const resolvedUrl =
    await resolveFacebookShareUrl(
      parsedUrl
    );

  /*
   * Validate the resolved destination again.
   *
   * This maintains the SSRF protection boundary.
   */
  await validateHostname(
    resolvedUrl.hostname
  );

  return resolvedUrl;
}
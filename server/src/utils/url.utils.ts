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

const FACEBOOK_USER_AGENTS = [
  // Normal desktop browser
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",

  // Facebook crawler
  "facebookexternalhit/1.1",

  // Mobile browser
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
];

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
    (a === 100 &&
      b >= 64 &&
      b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 &&
      b >= 16 &&
      b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 &&
      (b === 18 || b === 19))
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
    net.isIP(
      normalized.substring(7)
    ) === 4
  );
}

function isBlockedAddress(
  address: string
): boolean {
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
  return (
    isFacebookHostname(
      url.hostname
    ) &&
    (
      url.pathname === "/share" ||
      url.pathname.startsWith(
        "/share/"
      )
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
    pathname.startsWith("/reel/") ||
    pathname.startsWith("/watch") ||
    pathname.includes("/videos/")
  );
}

function buildFacebookReelUrl(
  id: string,
  hostname = "www.facebook.com"
): URL {
  return new URL(
    `https://${hostname}/reel/${id}`
  );
}

function buildFacebookWatchUrl(
  id: string,
  hostname = "www.facebook.com"
): URL {
  return new URL(
    `https://${hostname}/watch/?v=${id}`
  );
}

function extractFacebookMediaUrl(
  value: string
): URL | null {
  /*
   * Look for canonical Facebook Reel URLs.
   *
   * Example:
   * https://www.facebook.com/reel/123456789/
   */
  const reelMatch = value.match(
    /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/reel\/(\d+)/i
  );

  if (reelMatch?.[1]) {
    return buildFacebookReelUrl(
      reelMatch[1]
    );
  }

  /*
   * Look for Facebook watch URLs.
   *
   * Example:
   * https://www.facebook.com/watch/?v=123456789
   */
  const watchMatch = value.match(
    /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/watch\/?(?:\?[^"'<>]*?\bv=)(\d+)/i
  );

  if (watchMatch?.[1]) {
    return buildFacebookWatchUrl(
      watchMatch[1]
    );
  }

  /*
   * Look for Facebook /videos/<id> URLs.
   */
  const videosMatch = value.match(
    /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/[^"'<>\/\s]+\/videos\/(\d+)/i
  );

  if (videosMatch?.[1]) {
    return new URL(
      `https://www.facebook.com/watch/?v=${videosMatch[1]}`
    );
  }

  return null;
}

function extractFacebookMediaId(
  value: string
): URL | null {
  /*
   * Handle URLs where Facebook gives us a
   * relative destination instead of an absolute URL.
   */

  const reelMatch = value.match(
    /\/reel\/(\d+)/i
  );

  if (reelMatch?.[1]) {
    return buildFacebookReelUrl(
      reelMatch[1]
    );
  }

  const watchMatch = value.match(
    /\/watch\/?(?:\?[^"'<>]*?\bv=)(\d+)/i
  );

  if (watchMatch?.[1]) {
    return buildFacebookWatchUrl(
      watchMatch[1]
    );
  }

  const videosMatch = value.match(
    /\/videos\/(\d+)/i
  );

  if (videosMatch?.[1]) {
    return new URL(
      `https://www.facebook.com/watch/?v=${videosMatch[1]}`
    );
  }

  return null;
}

function extractCanonicalFromHtml(
  html: string
): URL | null {
  /*
   * Facebook frequently exposes canonical URLs
   * through:
   *
   * <link rel="canonical" href="...">
   *
   * or Open Graph:
   *
   * <meta property="og:url" content="...">
   */

  const canonicalPatterns = [
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,

    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i,

    /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i,

    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:url["']/i,
  ];

  for (const pattern of canonicalPatterns) {
    const match = html.match(pattern);

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

    const mediaIdUrl =
      extractFacebookMediaId(
        match[1]
      );

    if (mediaIdUrl) {
      return mediaIdUrl;
    }
  }

  /*
   * Fallback: scan the HTML directly for
   * Facebook Reel URLs.
   */
  const directMedia =
    extractFacebookMediaUrl(
      html
    );

  if (directMedia) {
    return directMedia;
  }

  const directMediaId =
    extractFacebookMediaId(
      html
    );

  if (directMediaId) {
    return directMediaId;
  }

  return null;
}

function extractFacebookShareDestination(
  location: string,
  baseUrl: URL
): URL | null {
  let destination: URL;

  try {
    destination =
      new URL(
        location,
        baseUrl
      );
  } catch {
    return null;
  }

  if (
    !["http:", "https:"].includes(
      destination.protocol
    )
  ) {
    return null;
  }

  if (
    destination.username ||
    destination.password
  ) {
    return null;
  }

  if (
    !isFacebookHostname(
      destination.hostname
    )
  ) {
    return null;
  }

  /*
   * Best case:
   *
   * /share/r/ABC
   *      ↓
   * /reel/123456789
   */
  if (
    isFacebookMediaUrl(
      destination
    )
  ) {
    return destination;
  }

  /*
   * Sometimes the redirect itself is a login URL
   * containing the original share URL in `next`.
   *
   * Do NOT pass the login URL to yt-dlp.
   */
  if (
    destination.pathname ===
      "/login" ||
    destination.pathname ===
      "/login/"
  ) {
    const next =
      destination.searchParams.get(
        "next"
      );

    if (next) {
      try {
        const nextUrl =
          new URL(next);

        if (
          isFacebookMediaUrl(
            nextUrl
          )
        ) {
          return nextUrl;
        }
      } catch {
        // Ignore malformed next parameter.
      }
    }
  }

  /*
   * Even if the destination isn't canonical,
   * inspect the URL itself for a media ID.
   */
  const mediaUrl =
    extractFacebookMediaId(
      destination.toString()
    );

  if (mediaUrl) {
    return mediaUrl;
  }

  return null;
}

async function fetchFacebookPage(
  url: URL,
  userAgent: string
): Promise<{
  response: Response;
  html: string;
}> {
  const response = await fetch(
    url.toString(),
    {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": userAgent,

        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

        "Accept-Language":
          "en-US,en;q=0.9",

        "Cache-Control":
          "no-cache",

        Pragma:
          "no-cache",
      },

      signal:
        AbortSignal.timeout(
          10_000
        ),
    }
  );

  let html = "";

  /*
   * Only read HTML responses.
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
    try {
      html =
        await response.text();
    } catch {
      html = "";
    }
  }

  return {
    response,
    html,
  };
}

async function resolveFacebookShareUrl(
  url: URL
): Promise<URL> {
  if (!isFacebookShareUrl(url)) {
    return url;
  }

  /*
   * Try the original Facebook host first,
   * then mobile and web Facebook hosts.
   *
   * Different Facebook hosts can receive
   * different redirect behavior.
   */
  const candidateUrls = [
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
   * Remove duplicate URLs.
   */
  const uniqueCandidates =
    Array.from(
      new Map(
        candidateUrls.map(
          (candidate) => [
            candidate.toString(),
            candidate,
          ]
        )
      ).values()
    );

  for (const candidate of uniqueCandidates) {
    await validateHostname(
      candidate.hostname
    );

    for (const userAgent of FACEBOOK_USER_AGENTS) {
      let result: {
        response: Response;
        html: string;
      };

      try {
        result =
          await fetchFacebookPage(
            candidate,
            userAgent
          );
      } catch {
        continue;
      }

      const {
        response,
        html,
      } = result;

      /*
       * FIRST:
       * Inspect the Location header.
       */
      const location =
        response.headers.get(
          "location"
        );

      if (location) {
        const destination =
          extractFacebookShareDestination(
            location,
            candidate
          );

        if (destination) {
          await validateHostname(
            destination.hostname
          );

          return destination;
        }
      }

      /*
       * SECOND:
       * Inspect the returned HTML.
       *
       * This catches cases where Facebook doesn't
       * provide a normal HTTP redirect.
       */
      if (html) {
        const htmlMediaUrl =
          extractCanonicalFromHtml(
            html
          );

        if (htmlMediaUrl) {
          await validateHostname(
            htmlMediaUrl.hostname
          );

          return htmlMediaUrl;
        }
      }
    }
  }

  /*
   * If Facebook gives us a login page with no
   * canonical media URL, we cannot safely invent
   * the Reel ID.
   *
   * Return the original share URL and let yt-dlp
   * attempt its own extractor behavior.
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
    parsedUrl = new URL(value);
  } catch {
    throw new Error(
      "The provided URL is invalid."
    );
  }

  if (
    !["http:", "https:"].includes(
      parsedUrl.protocol
    )
  ) {
    throw new Error(
      "Only HTTP and HTTPS URLs are allowed."
    );
  }

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
   * attempting Facebook resolution.
   */
  await validateHostname(
    parsedUrl.hostname
  );

  /*
   * Resolve Facebook share URLs ourselves.
   */
  const resolvedUrl =
    await resolveFacebookShareUrl(
      parsedUrl
    );

  /*
   * Validate the final URL again.
   *
   * This preserves the SSRF boundary even
   * after redirect resolution.
   */
  await validateHostname(
    resolvedUrl.hostname
  );

  return resolvedUrl;
}
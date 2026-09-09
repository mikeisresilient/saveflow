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

/**
 * Facebook sometimes redirects:
 *
 * /share/r/ABC123/
 *
 * to:
 *
 * /login/?next=https%3A%2F%2Fwww.facebook.com%2Fshare%2Fr%2FABC123%2F
 *
 * We must NOT pass that login URL to yt-dlp.
 *
 * Instead, recover the URL contained in the `next`
 * parameter and return the original Facebook share
 * URL so yt-dlp can attempt to handle it.
 */
function recoverFacebookShareUrlFromLogin(
  url: URL
): URL | null {
  if (
    !isFacebookHostname(
      url.hostname
    )
  ) {
    return null;
  }

  if (
    url.pathname !== "/login/" &&
    url.pathname !== "/login"
  ) {
    return null;
  }

  const next = url.searchParams.get(
    "next"
  );

  if (!next) {
    return null;
  }

  let nextUrl: URL;

  try {
    nextUrl = new URL(next);
  } catch {
    return null;
  }

  if (
    !["http:", "https:"].includes(
      nextUrl.protocol
    )
  ) {
    return null;
  }

  if (
    nextUrl.username ||
    nextUrl.password
  ) {
    return null;
  }

  if (
    !isFacebookHostname(
      nextUrl.hostname
    )
  ) {
    return null;
  }

  if (
    !isFacebookShareUrl(nextUrl)
  ) {
    return null;
  }

  return nextUrl;
}

async function resolveFacebookShareUrl(
  url: URL
): Promise<URL> {
  /*
   * Only resolve Facebook share URLs.
   *
   * This prevents arbitrary URLs from being
   * followed as part of URL normalization.
   */
  if (!isFacebookShareUrl(url)) {
    return url;
  }

  let response: Response;

  try {
    response = await fetch(
      url.toString(),
      {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml",
        },
        signal:
          AbortSignal.timeout(
            10_000
          ),
      }
    );
  } catch {
    /*
     * If Facebook itself cannot be reached,
     * leave the original URL for yt-dlp.
     */
    return url;
  }

  const location =
    response.headers.get(
      "location"
    );

  /*
   * Facebook may respond with a redirect.
   */
  if (location) {
    let redirectedUrl: URL;

    try {
      redirectedUrl =
        new URL(
          location,
          url
        );
    } catch {
      throw new Error(
        "Facebook returned an invalid redirect URL."
      );
    }

    if (
      !["http:", "https:"].includes(
        redirectedUrl.protocol
      )
    ) {
      throw new Error(
        "Facebook returned an unsupported redirect URL."
      );
    }

    if (
      redirectedUrl.username ||
      redirectedUrl.password
    ) {
      throw new Error(
        "Facebook returned an unsafe redirect URL."
      );
    }

    /*
     * Only allow Facebook destinations.
     *
     * This prevents the share URL from being
     * abused as an open redirect / SSRF proxy.
     */
    if (
      !isFacebookHostname(
        redirectedUrl.hostname
      )
    ) {
      throw new Error(
        "Facebook returned an unsupported redirect destination."
      );
    }

    await validateHostname(
      redirectedUrl.hostname
    );

    /*
     * IMPORTANT:
     *
     * If Facebook redirected us to:
     *
     * /login/?next=<original-share-url>
     *
     * don't return the login URL.
     *
     * Recover the original share URL instead.
     */
    const recoveredShareUrl =
      recoverFacebookShareUrlFromLogin(
        redirectedUrl
      );

    if (recoveredShareUrl) {
      return recoveredShareUrl;
    }

    /*
     * If this is a real Facebook destination
     * such as /reel/123456, return it normally.
     */
    return redirectedUrl;
  }

  /*
   * Some Facebook share URLs may return the
   * destination without a normal HTTP redirect.
   *
   * Leave the original URL intact and allow
   * yt-dlp to handle it.
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
   * Validate the original hostname before doing
   * any redirect resolution.
   */
  await validateHostname(
    parsedUrl.hostname
  );

  /*
   * Facebook share URLs are resolved to their
   * actual Facebook media URL when possible.
   */
  const resolvedUrl =
    await resolveFacebookShareUrl(
      parsedUrl
    );

  /*
   * Validate the final URL again.
   *
   * This is important because the destination
   * must receive the same SSRF protection as
   * the original URL.
   */
  await validateHostname(
    resolvedUrl.hostname
  );

  return resolvedUrl;
}
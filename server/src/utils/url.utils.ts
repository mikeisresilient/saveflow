import dns from "node:dns/promises";
import net from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
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

  const hostname =
    parsedUrl.hostname.toLowerCase();

  if (!hostname) {
    throw new Error(
      "The provided URL has no hostname."
    );
  }

  if (
    BLOCKED_HOSTNAMES.has(hostname)
  ) {
    throw new Error(
      "Local and internal URLs are not allowed."
    );
  }

  if (isBlockedAddress(hostname)) {
    throw new Error(
      "Private and internal IP addresses are not allowed."
    );
  }

  if (net.isIP(hostname)) {
    return parsedUrl;
  }

  try {
    const addresses =
      await dns.lookup(hostname, {
        all: true,
        verbatim: true,
      });

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

  return parsedUrl;
}
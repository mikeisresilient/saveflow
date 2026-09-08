export function validateInfoRequest(
  body: unknown
): { url: string } {
  if (
    typeof body !== "object" ||
    body === null ||
    !("url" in body)
  ) {
    throw new Error(
      "A media URL is required."
    );
  }

  const { url } = body as {
    url?: unknown;
  };

  if (
    typeof url !== "string" ||
    !url.trim()
  ) {
    throw new Error(
      "A valid media URL is required."
    );
  }

  return {
    url: url.trim(),
  };
}

export function validateDownloadRequest(
  body: unknown
): {
  url: string;
  formatId: string;
  type: "video" | "audio";
} {
  if (
    typeof body !== "object" ||
    body === null
  ) {
    throw new Error(
      "Invalid download request."
    );
  }

  const {
    url,
    formatId,
    type,
  } = body as {
    url?: unknown;
    formatId?: unknown;
    type?: unknown;
  };

  if (
    typeof url !== "string" ||
    !url.trim()
  ) {
    throw new Error(
      "A valid media URL is required."
    );
  }

  if (
    typeof formatId !== "string" ||
    !formatId.trim()
  ) {
    throw new Error(
      "A format ID is required."
    );
  }

  if (
    type !== "video" &&
    type !== "audio"
  ) {
    throw new Error(
      "Download type must be video or audio."
    );
  }

  return {
    url: url.trim(),
    formatId: formatId.trim(),
    type,
  };
}
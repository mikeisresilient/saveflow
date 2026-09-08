export const MAX_MEDIA_DURATION_SECONDS = 30 * 60;

export const MAX_DOWNLOAD_SIZE_BYTES =
  500 * 1024 * 1024;

export function validateMediaDuration(
  duration: number | null | undefined
): void {
  if (
    duration !== null &&
    duration !== undefined &&
    duration > MAX_MEDIA_DURATION_SECONDS
  ) {
    throw new Error(
      "This media is too long. SaveFlow currently supports media up to 30 minutes."
    );
  }
}

export function validateDownloadSize(
  fileSize: number | null | undefined
): void {
  if (
    fileSize !== null &&
    fileSize !== undefined &&
    fileSize > MAX_DOWNLOAD_SIZE_BYTES
  ) {
    throw new Error(
      "This download is too large. SaveFlow currently supports files up to 500 MB."
    );
  }
}
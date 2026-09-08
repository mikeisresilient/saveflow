const MAX_ACTIVE_DOWNLOADS = 2;

let activeDownloads = 0;

export function acquireDownloadSlot(): boolean {
  if (activeDownloads >= MAX_ACTIVE_DOWNLOADS) {
    return false;
  }

  activeDownloads += 1;

  return true;
}

export function releaseDownloadSlot(): void {
  activeDownloads = Math.max(
    0,
    activeDownloads - 1
  );
}

export function getActiveDownloadCount(): number {
  return activeDownloads;
}
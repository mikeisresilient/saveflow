import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { processFormats, RawFormat } from "../utils/format.utils.js";

const execFileAsync = promisify(execFile);

export async function getMediaInfo(url: string) {
  const { stdout } = await execFileAsync(
    "python",
    [
      "-m",
      "yt_dlp",
      "--dump-single-json",
      "--skip-download",
      "--no-playlist",
      url,
    ],
    {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30_000,
      windowsHide: true,
    }
  );

  const data = JSON.parse(stdout);

  const rawFormats: RawFormat[] = Array.isArray(data.formats)
    ? data.formats.map((format: any) => ({
        formatId: format.format_id,
        extension: format.ext,
        width: format.width,
        height: format.height,
        resolution: format.resolution,
        fps: format.fps,
        videoCodec: format.vcodec,
        audioCodec: format.acodec,
        fileSize:
          format.filesize ??
          format.filesize_approx ??
          null,
        bitrate: format.tbr,
      }))
    : [];

  const formats = processFormats(rawFormats);

  return {
    id: data.id,
    title: data.title,
    description: data.description,
    thumbnail: data.thumbnail,
    duration: data.duration,
    uploader: data.uploader,
    webpageUrl: data.webpage_url,
    extractor: data.extractor,
    formats,
  };
}
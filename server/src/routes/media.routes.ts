import { Router } from "express";
import { getMediaInfo } from "../services/media.service.js";
import { validateMediaUrl } from "../utils/url.utils.js";
import {
  acquireDownloadSlot,
  releaseDownloadSlot,
} from "../utils/download-limit.utils.js";
import {
  validateInfoRequest,
  validateDownloadRequest,
} from "../utils/request.utils.js";
import {
  validateMediaDuration,
  validateDownloadSize,
} from "../utils/limits.utils.js";
import {
  downloadMedia,
  cleanupDownload,
  isValidFormatId,
  DownloadError,
} from "../services/download/download.service.js";

const router = Router();

router.post("/info", async (req, res) => {
  try {
    const { url } =
      validateInfoRequest(req.body);

    const parsedUrl = await validateMediaUrl(url);

    const media = await getMediaInfo(
      parsedUrl.toString()
    );

    validateMediaDuration(media.duration);

    return res.json({
      success: true,
      media,
    });
  } catch (error) {
    console.error("Media info error:", error);

    return res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to analyze this media URL.",
    });
  }
});

router.post("/download", async (req, res) => {
  let filePath: string | null = null;

  try {
    if (!acquireDownloadSlot()) {
      return res.status(429).json({
        success: false,
        error:
          "Too many downloads are currently in progress. Please try again shortly.",
      });
    }
    const {
      url,
      formatId,
      type,
    } = validateDownloadRequest(
      req.body
    );

    const parsedUrl = await validateMediaUrl(url);

    const safeUrl = parsedUrl.toString();

    const media = await getMediaInfo(safeUrl);

    validateMediaDuration(media.duration);

    const availableFormats =
      type === "video"
        ? media.formats.video
        : media.formats.audio;

    const availableFormatIds = availableFormats.map(
      (format) => format.formatId
    );

    if (
      !isValidFormatId(
        formatId,
        availableFormatIds
      )
    ) {
      return res.status(400).json({
        success: false,
        error:
          "The requested format is not available for this media.",
      });
    }

    const selectedFormat = availableFormats.find(
      (format) => format.formatId === formatId
    );

    validateDownloadSize(
      selectedFormat?.fileSize
    );

    const result = await downloadMedia({
      url: safeUrl,
      formatId,
      type,
    });

    filePath = result.filePath;

    return res.download(
      result.filePath,
      result.fileName,
      {
        headers: {
          "Content-Type": result.contentType,
        },
      },
      async (error) => {
        if (error) {
          console.error(
            "Download response error:",
            error
          );
        }

        if (filePath) {
          await cleanupDownload(filePath).catch(
            (cleanupError) => {
              console.error(
                "Cleanup error:",
                cleanupError
              );
            }
          );
        }
        releaseDownloadSlot();
      }
    );
  } catch (error) {
    console.error(
      "Media download error:",
      error
    );

    if (filePath) {
      await cleanupDownload(filePath).catch(
        () => { }
      );
    }
    releaseDownloadSlot();

    const statusCode =
      error instanceof DownloadError
        ? error.statusCode
        : 500;

    return res.status(statusCode).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to download this media.",
    });
  }
});

export default router;
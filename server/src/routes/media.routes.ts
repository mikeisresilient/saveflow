import { Router } from "express";

import {
  analysisLimiter,
  downloadLimiter,
} from "../middleware/rate-limit.middleware.js";

import {
  getMediaInfo,
} from "../services/media.service.js";

import {
  validateMediaUrl,
} from "../utils/url.utils.js";

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

router.post(
  "/info",
  analysisLimiter,
  async (req, res) => {
    try {
      const { url } =
        validateInfoRequest(
          req.body
        );

      const parsedUrl =
        await validateMediaUrl(url);

      const media =
        await getMediaInfo(
          parsedUrl.toString()
        );

      validateMediaDuration(
        media.duration
      );

      return res.json({
        success: true,
        media,
      });
    } catch (error) {
      console.error(
        "Media info error:",
        error
      );

      return res.status(400).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to analyze this media URL.",
      });
    }
  }
);

router.post(
  "/download",
  downloadLimiter,
  async (req, res) => {
    let filePath: string | null =
      null;

    let downloadSlotAcquired =
      false;

    try {
      /*
       * Step 1
       * Validate the request body first.
       */
      const {
        url,
        formatId,
        type,
      } =
        validateDownloadRequest(
          req.body
        );

      /*
       * Step 2
       * Validate the URL before doing
       * any expensive media processing.
       */
      const parsedUrl =
        await validateMediaUrl(url);

      const safeUrl =
        parsedUrl.toString();

      /*
       * Step 3
       * Analyze the media so the server
       * knows the actual available formats.
       */
      const media =
        await getMediaInfo(
          safeUrl
        );

      /*
       * Step 4
       * Enforce the duration limit.
       */
      validateMediaDuration(
        media.duration
      );

      /*
       * Step 5
       * Select formats based on the
       * requested download type.
       */
      const availableFormats =
        type === "video"
          ? media.formats.video
          : media.formats.audio;

      /*
       * Step 6
       * Build the authoritative list
       * of formats available for this media.
       */
      const availableFormatIds =
        availableFormats.map(
          (format) =>
            format.formatId
        );

      /*
       * Step 7
       * Reject manually supplied or
       * tampered format IDs.
       */
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

      /*
       * Step 8
       * Find the exact selected format.
       */
      const selectedFormat =
        availableFormats.find(
          (format) =>
            format.formatId ===
            formatId
        );

      if (!selectedFormat) {
        return res.status(400).json({
          success: false,
          error:
            "The selected format could not be found.",
        });
      }

      /*
       * Step 9
       * Validate the estimated format
       * size before starting the download.
       */
      validateDownloadSize(
        selectedFormat.fileSize
      );

      /*
       * Step 10
       * Only now acquire a concurrent
       * download slot.
       */
      if (!acquireDownloadSlot()) {
        return res.status(429).json({
          success: false,
          error:
            "Too many downloads are currently in progress. Please try again shortly.",
        });
      }

      downloadSlotAcquired =
        true;

      /*
       * Step 11
       * Perform the actual download.
       */
      const result =
        await downloadMedia({
          url: safeUrl,
          formatId,
          type,
        });

      filePath =
        result.filePath;

      /*
       * Step 12
       * Send the generated file.
       */
      return res.download(
        result.filePath,
        result.fileName,
        {
          headers: {
            "Content-Type":
              result.contentType,
          },
        },
        async (error) => {
          if (error) {
            console.error(
              "Download response error:",
              error
            );
          }

          /*
           * Always remove the temporary
           * download directory.
           */
          if (filePath) {
            await cleanupDownload(
              filePath
            ).catch(
              (cleanupError) => {
                console.error(
                  "Cleanup error:",
                  cleanupError
                );
              }
            );
          }

          /*
           * Release the concurrency
           * slot after the response finishes.
           */
          if (
            downloadSlotAcquired
          ) {
            releaseDownloadSlot();

            downloadSlotAcquired =
              false;
          }
        }
      );
    } catch (error) {
      console.error(
        "Media download error:",
        error
      );

      /*
       * Clean up any generated file
       * if an error happens.
       */
      if (filePath) {
        await cleanupDownload(
          filePath
        ).catch(
          (cleanupError) => {
            console.error(
              "Cleanup error:",
              cleanupError
            );
          }
        );
      }

      /*
       * Release the slot if this request
       * had already acquired one.
       */
      if (
        downloadSlotAcquired
      ) {
        releaseDownloadSlot();

        downloadSlotAcquired =
          false;
      }

      /*
       * Preserve DownloadError status
       * codes when available.
       */
      const statusCode =
        error instanceof DownloadError
          ? error.statusCode
          : 500;

      return res.status(
        statusCode
      ).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to download this media.",
      });
    }
  }
);

export default router;
"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useState,
  type SyntheticEvent,
} from "react";

interface VideoFormat {
  formatId: string;
  type: "video";
  quality: string;
  extension: string;
  width: number;
  height: number;
  fps: number | null;
  fileSize: number | null;
}

interface AudioFormat {
  formatId: string;
  type: "audio";
  quality: string;
  extension: string;
  bitrate: number | null;
  fileSize: number | null;
}

interface MediaInfo {
  id?: string;
  title: string;
  thumbnail?: string | null;
  duration?: number | null;
  uploader?: string | null;
  formats: {
    video: VideoFormat[];
    audio: AudioFormat[];
  };
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:5000";

function sanitizeFileName(
  name: string
): string {
  return name
    .replace(
      /[<>:"/\\|?*\x00-\x1F]/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
}

function formatDuration(
  seconds: number | null | undefined
): string {
  if (
    seconds === null ||
    seconds === undefined ||
    !Number.isFinite(seconds)
  ) {
    return "Unknown duration";
  }

  const totalSeconds =
    Math.max(0, Math.floor(seconds));

  const hours =
    Math.floor(totalSeconds / 3600);

  const minutes =
    Math.floor(
      (totalSeconds % 3600) / 60
    );

  const remainingSeconds =
    totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(
      minutes
    ).padStart(2, "0")}:${String(
      remainingSeconds
    ).padStart(2, "0")}`;
  }

  return `${minutes}:${String(
    remainingSeconds
  ).padStart(2, "0")}`;
}

function formatFileSize(
  bytes: number | null | undefined
): string {
  if (
    bytes === null ||
    bytes === undefined ||
    !Number.isFinite(bytes) ||
    bytes <= 0
  ) {
    return "Size unavailable";
  }

  const mb =
    bytes / (1024 * 1024);

  if (mb < 1) {
    return `${Math.round(
      bytes / 1024
    )} KB`;
  }

  if (mb >= 1024) {
    return `${(
      mb / 1024
    ).toFixed(2)} GB`;
  }

  return `${mb.toFixed(1)} MB`;
}

function DownloadIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin motion-reduce:animate-none"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />

      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

export default function Home() {
  const [url, setUrl] =
    useState("");

  const [media, setMedia] =
    useState<MediaInfo | null>(null);

  const [isAnalyzing, setIsAnalyzing] =
    useState(false);

  const [isWakingUp, setIsWakingUp] =
    useState(false);

  const [
    downloadingFormat,
    setDownloadingFormat,
  ] = useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState<string | null>(null);

  const statusMessage =
    isAnalyzing
      ? "Analyzing the media URL."
      : downloadingFormat
        ? "Preparing your download."
        : success || error || "";

  async function handleAnalyze(
    event: SyntheticEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const trimmedUrl =
      url.trim();

    if (!trimmedUrl) {
      setError(
        "Please paste a media URL first."
      );
      setMedia(null);
      return;
    }

    setError(null);
    setSuccess(null);
    setMedia(null);
    setIsAnalyzing(true);
    setIsWakingUp(false);

    const wakeUpTimer = window.setTimeout(() => {
      setIsWakingUp(true);
    }, 8000);

    try {
      const response =
        await fetch(
          `${API_URL}/api/media/info`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Accept:
                "application/json",
            },
            body: JSON.stringify({
              url: trimmedUrl,
            }),
          }
        );

      const data =
        await response.json();

      setIsWakingUp(false);

      if (!response.ok) {
        throw new Error(
          data?.error ||
            data?.message ||
            "Unable to analyze this media."
        );
      }

      if (!data?.media) {
        throw new Error(
          "No media information was returned."
        );
      }

      setMedia(data.media);

      setSuccess(
        "Media found successfully. Choose a format below to download."
      );

      setTimeout(() => {
        document
          .getElementById("results")
          ?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
      }, 150);
    } catch (requestError) {
      setIsWakingUp(false);
      console.error(
        "Analyze error:",
        requestError
      );

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to analyze this media right now."
      );
    } finally {
      window.clearTimeout(wakeUpTimer);
      setIsWakingUp(false);
      setIsAnalyzing(false);
    }
  }

  async function handleDownload(
    formatId: string,
    type: "video" | "audio",
    quality?: string
  ) {
    if (!url.trim()) {
      setError(
        "Please analyze the media again before downloading."
      );
      return;
    }

    if (downloadingFormat) {
      return;
    }

    setError(null);
    setSuccess(null);
    setDownloadingFormat(
      formatId
    );

    try {
      const response =
        await fetch(
          `${API_URL}/api/media/download`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Accept:
                "application/json",
            },
            body: JSON.stringify({
              url: url.trim(),
              formatId,
              type,
            }),
          }
        );

      if (!response.ok) {
        let message =
          "Unable to download this media.";

        try {
          const data =
            await response.json();

          message =
            data?.error ||
            data?.message ||
            message;
        } catch {
          // Ignore invalid error response bodies.
        }

        throw new Error(message);
      }

      const blob =
        await response.blob();

      if (!blob.size) {
        throw new Error(
          "The downloaded file was empty."
        );
      }

      const contentDisposition =
        response.headers.get(
          "Content-Disposition"
        );

      let fileName =
        media?.title
          ? sanitizeFileName(
              media.title
            )
          : "saveflow-download";

      const filenameMatch =
        contentDisposition?.match(
          /filename\*?=(?:UTF-8'')?["']?([^;"']+)["']?/i
        );

      if (filenameMatch?.[1]) {
        try {
          fileName =
            decodeURIComponent(
              filenameMatch[1]
            );
        } catch {
          fileName =
            filenameMatch[1];
        }
      }

      if (!fileName) {
        fileName =
          "saveflow-download";
      }

      const hasExtension =
        /\.[a-z0-9]{2,5}$/i.test(
          fileName
        );

      if (!hasExtension) {
        fileName +=
          type === "audio"
            ? ".mp3"
            : ".mp4";
      }

      const objectUrl =
        window.URL.createObjectURL(
          blob
        );

      const anchor =
        document.createElement(
          "a"
        );

      anchor.href =
        objectUrl;

      anchor.download =
        fileName;

      document.body.appendChild(
        anchor
      );

      anchor.click();

      anchor.remove();

      window.URL.revokeObjectURL(
        objectUrl
      );

      setSuccess(
        `${quality || "Your file"} is ready and the download has started.`
      );
    } catch (requestError) {
      console.error(
        "Download error:",
        requestError
      );

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to download this media right now."
      );
    } finally {
      setDownloadingFormat(
        null
      );
    }
  }

  function handleClear() {
    setUrl("");
    setMedia(null);
    setError(null);
    setSuccess(null);
    setDownloadingFormat(
      null
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      {/* Accessibility status */}
      <div
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      >
        {statusMessage}
      </div>

      {/* Navigation */}
      <header className="border-b border-white/10">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
            aria-label="SaveFlow home"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-400/30 bg-cyan-400/10">
              <svg
                className="h-4 w-4 text-cyan-300"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14"
                />
              </svg>
            </div>

            <span className="text-lg font-bold tracking-tight">
              Save
              <span className="text-cyan-400">
                Flow
              </span>
            </span>
          </Link>

          <span className="text-right text-xs text-zinc-500 sm:text-sm">
            Simple. Fast. Clean.
          </span>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-7xl flex-col items-center justify-center px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
          <div className="max-w-4xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/5 px-3 py-1.5 text-xs font-medium text-cyan-300">
              <span
                className="h-1.5 w-1.5 rounded-full bg-cyan-400"
                aria-hidden="true"
              />
              Media downloader
            </div>

            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
              Download videos.
              <br />
              <span className="text-cyan-400">
                Keep the audio.
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">
              Save videos and audio from
              supported public media URLs in
              a few simple steps.
            </p>

            {/* URL Form */}
            <form
              onSubmit={handleAnalyze}
              className="mx-auto mt-10 w-full max-w-3xl"
              aria-label="Analyze media URL"
            >
              <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-2 sm:flex-row">
                <div className="relative flex-1">
                  <label
                    htmlFor="media-url"
                    className="sr-only"
                  >
                    Media URL
                  </label>

                  <input
                    id="media-url"
                    type="url"
                    value={url}
                    onChange={(event) =>
                      setUrl(
                        event.target.value
                      )
                    }
                    placeholder="Paste a video or media URL..."
                    autoComplete="url"
                    disabled={
                      isAnalyzing ||
                      Boolean(
                        downloadingFormat
                      )
                    }
                    aria-describedby="media-url-help"
                    className="min-h-12 w-full rounded-xl border border-white/10 bg-black px-4 pr-12 text-sm text-white outline-none placeholder:text-zinc-600 transition-colors focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                  />

                  <p
                    id="media-url-help"
                    className="sr-only"
                  >
                    Paste a supported public
                    media URL to analyze it.
                  </p>

                  {url && (
                    <button
                      type="button"
                      onClick={handleClear}
                      disabled={
                        isAnalyzing ||
                        Boolean(
                          downloadingFormat
                        )
                      }
                      aria-label="Clear URL"
                      className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 6l12 12M18 6L6 18"
                        />
                      </svg>
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={
                    isAnalyzing ||
                    !url.trim() ||
                    Boolean(
                      downloadingFormat
                    )
                  }
                  aria-busy={isAnalyzing}
                  aria-label={
                    isAnalyzing
                      ? "Analyzing media URL"
                      : "Analyze media URL"
                  }
                  className="min-h-12 rounded-xl bg-cyan-400 px-6 text-sm font-semibold text-black transition-colors hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:ring-offset-2 focus:ring-offset-black disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-32"
                >
                  {isAnalyzing ? (
                    <span className="flex items-center justify-center gap-2">
                      <Spinner />
                      Analyzing
                    </span>
                  ) : (
                    "Analyze"
                  )}
                </button>
              </div>
            </form>

            {isAnalyzing && (
              <div
                role="status"
                aria-live="polite"
                className="mx-auto mt-5 flex max-w-3xl items-start gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-left"
              >
                <svg
                  className="mt-0.5 h-5 w-5 shrink-0 animate-spin motion-reduce:animate-none text-cyan-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />

                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>

                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {isWakingUp
                      ? "SaveFlow is waking up."
                      : "Analyzing media..."}
                  </p>

                  <p className="mt-1 wrap-break-word text-xs leading-5 text-zinc-400 sm:text-sm">
                    {isWakingUp
                      ? "The free server may have gone to sleep. This can take up to about a minute. Please keep this page open."
                      : "We’re checking the URL and preparing the available formats."}
                  </p>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div
                role="alert"
                className="mx-auto mt-5 flex max-w-3xl items-start gap-3 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-left"
              >
                <svg
                  className="mt-0.5 h-5 w-5 shrink-0 text-red-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                  />

                  <path
                    strokeLinecap="round"
                    d="M12 8v4"
                  />

                  <path
                    strokeLinecap="round"
                    d="M12 16h.01"
                  />
                </svg>

                <div className="min-w-0">
                  <p className="text-sm font-semibold text-red-300">
                    Something went wrong
                  </p>

                  <p className="mt-1 wrap-break-word text-sm leading-6 text-red-300/80">
                    {error}
                  </p>
                </div>
              </div>
            )}

            {/* Success */}
            {success && !media && (
              <div
                role="status"
                className="mx-auto mt-5 flex max-w-3xl items-start gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-left"
              >
                <svg
                  className="mt-0.5 h-5 w-5 shrink-0 text-cyan-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                  />

                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m8 12 2.5 2.5L16 9"
                  />
                </svg>

                <p className="wrap-break-word text-sm leading-6 text-cyan-300">
                  {success}
                </p>
              </div>
            )}
          </div>

          {/* Supported platforms */}
          <div className="mt-14 w-full max-w-4xl">
            <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-zinc-600">
              Popular platforms
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2">
              {[
                "YouTube",
                "TikTok",
                "Instagram",
                "Facebook",
                "X",
                "Reddit",
                "Vimeo",
              ].map((platform) => (
                <span
                  key={platform}
                  className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-500"
                >
                  {platform}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Results */}
      {media && (
        <section
          id="results"
          aria-labelledby="results-heading"
          className="scroll-mt-6 border-t border-white/10 bg-zinc-950"
        >
          <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
            {/* Analysis success notice */}
            <div
              role="status"
              className="mb-6 flex flex-col gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-400/10">
                  <svg
                    className="h-4 w-4 text-cyan-300"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m5 12 4 4L19 6"
                    />
                  </svg>
                </div>

                <div className="min-w-0">
                  <h2
                    id="results-heading"
                    className="text-sm font-semibold text-white"
                  >
                    Media found successfully
                  </h2>

                  <p className="mt-1 text-xs leading-5 text-zinc-400 sm:text-sm">
                    Choose a video quality
                    or audio format below to
                    start your download.
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2 text-xs font-medium text-cyan-300 sm:text-sm">
                <svg
                  className="h-4 w-4 animate-bounce motion-reduce:animate-none"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 5v14m0 0-5-5m5 5 5-5"
                  />
                </svg>

                Scroll down to download
              </div>
            </div>

            {/* Media Preview */}
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
              <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr]">
                {/* Thumbnail */}
                <div className="relative aspect-video bg-black lg:aspect-auto lg:min-h-47.5">
                  {media.thumbnail ? (
                    <Image
                      src={media.thumbnail}
                      alt={`Thumbnail for ${media.title}`}
                      fill
                      sizes="(max-width: 1024px) 100vw, 280px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div
                      className="flex h-full min-h-48 items-center justify-center"
                      aria-label="No thumbnail available"
                    >
                      <svg
                        className="h-12 w-12 text-zinc-700"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        aria-hidden="true"
                      >
                        <rect
                          x="3"
                          y="4"
                          width="18"
                          height="16"
                          rx="2"
                        />

                        <path d="m10 9 5 3-5 3V9Z" />
                      </svg>
                    </div>
                  )}

                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-linear-to-t from-black/70 to-transparent lg:hidden" />
                </div>

                {/* Media details */}
                <div className="flex min-w-0 flex-col justify-center p-5 sm:p-6 lg:p-8">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-cyan-400/20 bg-cyan-400/5 px-2.5 py-1 text-xs font-medium text-cyan-300">
                      Media found
                    </span>

                    {media.duration !==
                      null &&
                      media.duration !==
                        undefined && (
                        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-zinc-400">
                          {formatDuration(
                            media.duration
                          )}
                        </span>
                      )}
                  </div>

                  <h3 className="mt-4 wrap-break-word text-xl font-semibold tracking-tight text-white sm:text-2xl">
                    {media.title}
                  </h3>

                  {media.uploader && (
                    <p className="mt-2 wrap-break-word text-sm text-zinc-500">
                      By{" "}
                      <span className="text-zinc-300">
                        {media.uploader}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Empty formats */}
            {media.formats.video.length ===
              0 &&
              media.formats.audio.length ===
                0 && (
                <div
                  role="status"
                  className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center"
                >
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
                    <svg
                      className="h-5 w-5 text-zinc-500"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden="true"
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="9"
                      />

                      <path
                        strokeLinecap="round"
                        d="M12 8v4"
                      />

                      <path
                        strokeLinecap="round"
                        d="M12 16h.01"
                      />
                    </svg>
                  </div>

                  <h3 className="mt-4 text-base font-semibold text-white">
                    No downloadable formats found
                  </h3>

                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">
                    SaveFlow could analyze
                    this media, but no
                    compatible video or audio
                    formats are currently
                    available.
                  </p>

                  <button
                    type="button"
                    onClick={handleClear}
                    className="mt-5 min-h-11 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-medium text-zinc-300 transition-colors hover:border-cyan-400/30 hover:bg-white/[0.05] hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:ring-offset-2 focus:ring-offset-zinc-950"
                  >
                    Try another URL
                  </button>
                </div>
              )}

            {/* Video Formats */}
            {media.formats.video.length >
              0 && (
              <section
                className="mt-10"
                aria-labelledby="video-formats-heading"
              >
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2
                      id="video-formats-heading"
                      className="text-xl font-semibold text-white"
                    >
                      Video formats
                    </h2>

                    <p className="mt-1 text-sm text-zinc-500">
                      Choose your preferred
                      video quality.
                    </p>
                  </div>

                  <span className="w-fit rounded-full border border-cyan-400/20 bg-cyan-400/5 px-3 py-1 text-xs font-medium text-cyan-300">
                    {
                      media.formats.video
                        .length
                    }{" "}
                    {media.formats.video
                      .length === 1
                      ? "option"
                      : "options"}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {media.formats.video.map(
                    (format) => {
                      const isDownloading =
                        downloadingFormat ===
                        format.formatId;

                      return (
                        <article
                          key={
                            format.formatId
                          }
                          className="group flex min-w-0 flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors duration-200 hover:border-cyan-400/30 hover:bg-white/[0.05]"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-2xl font-bold tracking-tight text-white">
                                {
                                  format.quality
                                }
                              </p>

                              <p className="mt-1 text-xs font-medium uppercase tracking-wider text-cyan-300">
                                {
                                  format.extension
                                }
                              </p>
                            </div>

                            <div className="shrink-0 rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-center">
                              <span className="block text-[10px] uppercase tracking-wider text-zinc-600">
                                Quality
                              </span>

                              <span className="text-sm font-semibold text-cyan-300">
                                {
                                  format.height
                                }
                                p
                              </span>
                            </div>
                          </div>

                          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-white/10 pt-4">
                            <div className="min-w-0">
                              <p className="text-xs text-zinc-600">
                                Resolution
                              </p>

                              <p className="mt-1 wrap-break-word text-sm font-medium text-zinc-200">
                                {
                                  format.width
                                }{" "}
                                ×{" "}
                                {
                                  format.height
                                }
                              </p>
                            </div>

                            <div className="min-w-0">
                              <p className="text-xs text-zinc-600">
                                FPS
                              </p>

                              <p className="mt-1 text-sm font-medium text-zinc-200">
                                {format.fps
                                  ? `${format.fps} FPS`
                                  : "Variable"}
                              </p>
                            </div>

                            <div className="min-w-0">
                              <p className="text-xs text-zinc-600">
                                Format
                              </p>

                              <p className="mt-1 text-sm font-medium uppercase text-zinc-200">
                                {
                                  format.extension
                                }
                              </p>
                            </div>

                            <div className="min-w-0">
                              <p className="text-xs text-zinc-600">
                                File size
                              </p>

                              <p className="mt-1 wrap-break-word text-sm font-medium text-zinc-200">
                                {formatFileSize(
                                  format.fileSize
                                )}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              handleDownload(
                                format.formatId,
                                "video",
                                format.quality
                              )
                            }
                            disabled={Boolean(
                              downloadingFormat
                            )}
                            aria-busy={
                              isDownloading
                            }
                            aria-label={
                              isDownloading
                                ? `Preparing ${format.quality} video download`
                                : `Download ${format.quality} video`
                            }
                            className="mt-6 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-black transition-colors hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:ring-offset-2 focus:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isDownloading ? (
                              <>
                                <Spinner />
                                Preparing...
                              </>
                            ) : (
                              <>
                                <DownloadIcon />
                                Download{" "}
                                {
                                  format.quality
                                }
                              </>
                            )}
                          </button>
                        </article>
                      );
                    }
                  )}
                </div>
              </section>
            )}

            {/* Audio Formats */}
            {media.formats.audio.length >
              0 && (
              <section
                className="mt-12"
                aria-labelledby="audio-formats-heading"
              >
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2
                      id="audio-formats-heading"
                      className="text-xl font-semibold text-white"
                    >
                      Audio formats
                    </h2>

                    <p className="mt-1 text-sm text-zinc-500">
                      Download the audio
                      separately as an MP3 file.
                    </p>
                  </div>

                  <span className="w-fit rounded-full border border-cyan-400/20 bg-cyan-400/5 px-3 py-1 text-xs font-medium text-cyan-300">
                    {
                      media.formats.audio
                        .length
                    }{" "}
                    {media.formats.audio
                      .length === 1
                      ? "option"
                      : "options"}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {media.formats.audio.map(
                    (format) => {
                      const isDownloading =
                        downloadingFormat ===
                        format.formatId;

                      return (
                        <article
                          key={
                            format.formatId
                          }
                          className="group flex min-w-0 flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors duration-200 hover:border-cyan-400/30 hover:bg-white/[0.05]"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-2xl font-bold tracking-tight text-white">
                                {
                                  format.quality
                                }
                              </p>

                              <p className="mt-1 text-xs font-medium uppercase tracking-wider text-cyan-300">
                                MP3 Audio
                              </p>
                            </div>

                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/5">
                              <svg
                                className="h-5 w-5 text-cyan-300"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                aria-hidden="true"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M9 18V5l10-2v13"
                                />

                                <circle
                                  cx="6"
                                  cy="18"
                                  r="3"
                                />

                                <circle
                                  cx="16"
                                  cy="16"
                                  r="3"
                                />
                              </svg>
                            </div>
                          </div>

                          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-white/10 pt-4">
                            <div className="min-w-0">
                              <p className="text-xs text-zinc-600">
                                Bitrate
                              </p>

                              <p className="mt-1 wrap-break-word text-sm font-medium text-zinc-200">
                                {format.bitrate
                                  ? `${format.bitrate} kbps`
                                  : "Variable"}
                              </p>
                            </div>

                            <div className="min-w-0">
                              <p className="text-xs text-zinc-600">
                                File size
                              </p>

                              <p className="mt-1 wrap-break-word text-sm font-medium text-zinc-200">
                                {formatFileSize(
                                  format.fileSize
                                )}
                              </p>
                            </div>

                            <div className="min-w-0">
                              <p className="text-xs text-zinc-600">
                                Format
                              </p>

                              <p className="mt-1 text-sm font-medium uppercase text-zinc-200">
                                MP3
                              </p>
                            </div>

                            <div className="min-w-0">
                              <p className="text-xs text-zinc-600">
                                Quality
                              </p>

                              <p className="mt-1 wrap-break-word text-sm font-medium text-zinc-200">
                                {
                                  format.quality
                                }
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              handleDownload(
                                format.formatId,
                                "audio",
                                format.quality
                              )
                            }
                            disabled={Boolean(
                              downloadingFormat
                            )}
                            aria-busy={
                              isDownloading
                            }
                            aria-label={
                              isDownloading
                                ? `Preparing ${format.quality} audio download`
                                : `Download ${format.quality} audio`
                            }
                            className="mt-6 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-300 transition-colors hover:bg-cyan-400/20 hover:text-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:ring-offset-2 focus:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isDownloading ? (
                              <>
                                <Spinner />
                                Preparing...
                              </>
                            ) : (
                              <>
                                <DownloadIcon />
                                Download MP3
                              </>
                            )}
                          </button>
                        </article>
                      );
                    }
                  )}
                </div>
              </section>
            )}

            {/* Download guidance */}
            {(media.formats.video.length >
              0 ||
              media.formats.audio.length >
                0) && (
              <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-center sm:p-5">
                <p className="text-sm text-zinc-400">
                  Choose a format above to
                  start your download.
                </p>

                <p className="mt-1 text-xs text-zinc-600">
                  Your file will be prepared
                  and downloaded automatically.
                </p>
              </div>
            )}

            {/* Analyze another */}
            <div className="mt-10 flex justify-center">
              <button
                type="button"
                onClick={handleClear}
                disabled={
                  isAnalyzing ||
                  Boolean(
                    downloadingFormat
                  )
                }
                className="min-h-11 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-medium text-zinc-300 transition-colors hover:border-cyan-400/30 hover:bg-white/[0.05] hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:ring-offset-2 focus:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Analyze another URL
              </button>
            </div>
          </div>
        </section>
      )}

      {/* How it works */}
      <section
        className="border-t border-white/10 bg-black"
        aria-labelledby="how-it-works-heading"
      >
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-400">
              How it works
            </p>

            <h2
              id="how-it-works-heading"
              className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl"
            >
              Three simple steps
            </h2>

            <p className="mt-4 text-zinc-500">
              No complicated setup. Paste,
              choose, and download.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              {
                number: "01",
                title: "Paste",
                text: "Copy a supported public media URL and paste it into SaveFlow.",
              },
              {
                number: "02",
                title: "Choose",
                text: "Analyze the media and select your preferred video quality or audio format.",
              },
              {
                number: "03",
                title: "Download",
                text: "Click download and SaveFlow prepares the selected file for you.",
              },
            ].map((step) => (
              <article
                key={step.number}
                className="rounded-2xl border border-white/10 bg-white/[0.02] p-6"
              >
                <span
                  className="text-sm font-semibold text-cyan-400"
                  aria-hidden="true"
                >
                  {step.number}
                </span>

                <h3 className="mt-4 text-lg font-semibold text-white">
                  {step.title}
                </h3>

                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  {step.text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div>
            <p className="text-sm font-semibold text-white">
              Save
              <span className="text-cyan-400">
                Flow
              </span>
            </p>

            <p className="mt-1 text-xs text-zinc-600">
              Download permitted public media
              with ease.
            </p>
          </div>

          <p className="text-xs text-zinc-600">
            © {new Date().getFullYear()}{" "}
            SaveFlow
          </p>
        </div>
      </footer>
    </main>
  );
}
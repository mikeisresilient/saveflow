"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type FormEvent } from "react";

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
  id: string;
  title: string;
  thumbnail: string;
  duration: number;
  uploader: string;
  webpageUrl: string;
  extractor: string;
  formats: {
    video: VideoFormat[];
    audio: AudioFormat[];
  };
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:5000";

export default function Home() {
  const [url, setUrl] = useState("");
  const [media, setMedia] =
    useState<MediaInfo | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [downloading, setDownloading] =
    useState<string | null>(null);

  async function handleAnalyze(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const trimmedUrl = url.trim();

    if (!trimmedUrl) {
      setError("Please paste a media URL.");
      return;
    }

    setLoading(true);
    setError("");
    setMedia(null);

    try {
      const response = await fetch(
        `${API_URL}/api/media/info`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            url: trimmedUrl,
          }),
        }
      );

      const data = await response
        .json()
        .catch(() => null);

      if (!response.ok || !data?.success) {
        throw new Error(
          data?.error ||
            "Unable to analyze this URL."
        );
      }

      setMedia(data.media);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while analyzing the media."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload(
    formatId: string,
    type: "video" | "audio"
  ) {
    if (!media) {
      setError(
        "Analyze a media URL before downloading."
      );
      return;
    }

    if (downloading !== null) {
      return;
    }

    setDownloading(formatId);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/api/media/download`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            url: media.webpageUrl,
            formatId,
            type,
          }),
        }
      );

      if (!response.ok) {
        const data = await response
          .json()
          .catch(() => null);

        throw new Error(
          data?.error ||
            "Unable to download this media."
        );
      }

      const blob =
        await response.blob();

      if (!blob.size) {
        throw new Error(
          "The downloaded file is empty."
        );
      }

      const downloadUrl =
        window.URL.createObjectURL(blob);

      const link =
        document.createElement("a");

      const extension =
        type === "audio"
          ? "mp3"
          : "mp4";

      const fileName =
        sanitizeFileName(
          media.title ||
            (type === "audio"
              ? "audio"
              : "video")
        );

      link.href = downloadUrl;
      link.download = `${fileName}.${extension}`;

      document.body.appendChild(link);

      link.click();

      link.remove();

      window.URL.revokeObjectURL(
        downloadUrl
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while downloading."
      );
    } finally {
      setDownloading(null);
    }
  }

  function formatDuration(
    seconds: number
  ): string {
    if (
      !Number.isFinite(seconds) ||
      seconds < 0
    ) {
      return "Unknown duration";
    }

    const hours = Math.floor(
      seconds / 3600
    );

    const minutes = Math.floor(
      (seconds % 3600) / 60
    );

    const remainingSeconds =
      Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes
        .toString()
        .padStart(2, "0")}:${remainingSeconds
        .toString()
        .padStart(2, "0")}`;
    }

    return `${minutes}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  }

  function formatFileSize(
    bytes: number | null
  ): string | null {
    if (
      !bytes ||
      !Number.isFinite(bytes) ||
      bytes <= 0
    ) {
      return null;
    }

    const mb =
      bytes / (1024 * 1024);

    if (mb < 1) {
      return `${Math.round(
        bytes / 1024
      )} KB`;
    }

    return `${mb.toFixed(1)} MB`;
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050505] text-white">
      {/* Navigation */}
      <nav className="border-b border-white/10">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight transition-colors hover:text-cyan-400 sm:text-2xl"
          >
            SaveFlow
          </Link>

          <div className="hidden items-center gap-8 text-sm text-zinc-400 md:flex">
            <a
              href="#how-it-works"
              className="transition-colors hover:text-white"
            >
              How it works
            </a>

            <a
              href="#platforms"
              className="transition-colors hover:text-white"
            >
              Platforms
            </a>
          </div>

          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-400 sm:px-4 sm:py-2">
            Free
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section>
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24 lg:px-10">
          <div className="mx-auto w-full max-w-4xl text-center">
            {/* Badge */}
            <div className="mb-7 inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs font-medium text-cyan-300 sm:text-sm">
              Video & Audio Downloader
            </div>

            {/* Heading */}
            <h1 className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
              Download videos.
              <span className="mt-2 block text-zinc-500">
                Keep the audio.
              </span>
            </h1>

            {/* Description */}
            <p className="mx-auto mt-7 max-w-2xl text-sm leading-6 text-zinc-400 sm:text-base sm:leading-7 md:text-lg">
              Paste a public video link from a
              supported platform and download
              the available video or audio
              formats.
            </p>

            {/* URL Form */}
            <form
              onSubmit={handleAnalyze}
              className="mx-auto mt-10 w-full max-w-3xl"
            >
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-2 sm:p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="url"
                    value={url}
                    onChange={(event) =>
                      setUrl(
                        event.target.value
                      )
                    }
                    placeholder="Paste your video link here..."
                    disabled={loading}
                    autoComplete="off"
                    spellCheck={false}
                    className="h-14 min-w-0 flex-1 rounded-xl bg-transparent px-4 text-sm text-white outline-none placeholder:text-zinc-600 focus:ring-1 focus:ring-cyan-400/50 disabled:cursor-not-allowed disabled:opacity-60 sm:text-base"
                  />

                  <button
                    type="submit"
                    disabled={
                      loading ||
                      !url.trim()
                    }
                    className="h-14 w-full rounded-xl bg-white px-7 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-32 sm:text-base"
                  >
                    {loading
                      ? "Analyzing..."
                      : "Analyze"}
                  </button>
                </div>
              </div>

              <p className="mt-4 text-xs leading-5 text-zinc-600">
                Download only content you own
                or have permission to save.
              </p>
            </form>

            {/* Error */}
            {error && (
              <div
                role="alert"
                className="mx-auto mt-6 max-w-3xl rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-left text-sm text-red-300"
              >
                {error}
              </div>
            )}

            {/* Media Result */}
            {media && (
              <div className="mx-auto mt-10 max-w-3xl text-left">
                <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02]">
                  {/* Media Information */}
                  <div className="grid md:grid-cols-[220px_1fr]">
                    <div className="relative aspect-video overflow-hidden bg-black md:aspect-auto">
                      <Image
                        src={media.thumbnail}
                        alt={media.title}
                        fill
                        sizes="(max-width: 768px) 100vw, 220px"
                        className="object-cover"
                        unoptimized
                      />

                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                        <span className="rounded-md bg-black/70 px-2 py-1 text-xs text-white">
                          {formatDuration(
                            media.duration
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="p-5 sm:p-7">
                      <p className="text-xs uppercase tracking-wider text-cyan-400">
                        {media.extractor}
                      </p>

                      <h2 className="mt-2 break-words text-xl font-semibold leading-tight sm:text-2xl">
                        {media.title}
                      </h2>

                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
                        <span>
                          {formatDuration(
                            media.duration
                          )}
                        </span>

                        <span
                          aria-hidden="true"
                          className="text-zinc-700"
                        >
                          •
                        </span>

                        <span className="break-all">
                          {media.uploader}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Formats */}
                  <div className="border-t border-white/10 p-5 sm:p-7">
                    {/* Video */}
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold">
                          Video
                        </h3>

                        <p className="mt-1 text-xs text-zinc-600">
                          MP4 with video and
                          audio
                        </p>
                      </div>

                      {media.formats.video
                        .length > 0 && (
                        <span className="text-xs text-zinc-600">
                          {
                            media.formats.video
                              .length
                          }{" "}
                          options
                        </span>
                      )}
                    </div>

                    <div className="mt-4 grid gap-3">
                      {media.formats.video
                        .length > 0 ? (
                        media.formats.video.map(
                          (format) => {
                            const isDownloading =
                              downloading ===
                              format.formatId;

                            const fileSize =
                              formatFileSize(
                                format.fileSize
                              );

                            return (
                              <button
                                key={
                                  format.formatId
                                }
                                type="button"
                                onClick={() =>
                                  handleDownload(
                                    format.formatId,
                                    "video"
                                  )
                                }
                                disabled={
                                  downloading !==
                                  null
                                }
                                className="group flex w-full items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-4 text-left transition-colors hover:border-cyan-400/30 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <div className="min-w-0">
                                  <p className="font-medium">
                                    {
                                      format.quality
                                    }
                                  </p>

                                  <p className="mt-1 text-xs text-zinc-600">
                                    {format.extension.toUpperCase()}{" "}
                                    •{" "}
                                    {
                                      format.width
                                    }
                                    ×
                                    {
                                      format.height
                                    }

                                    {format.fps
                                      ? ` • ${format.fps} FPS`
                                      : ""}

                                    {fileSize
                                      ? ` • ${fileSize}`
                                      : ""}
                                  </p>
                                </div>

                                <span className="shrink-0 text-sm font-medium text-cyan-400">
                                  {isDownloading
                                    ? "Downloading..."
                                    : "Download"}
                                </span>
                              </button>
                            );
                          }
                        )
                      ) : (
                        <p className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-4 text-sm text-zinc-500">
                          No compatible video
                          formats found.
                        </p>
                      )}
                    </div>

                    {/* Audio */}
                    <div className="mt-8 flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold">
                          Audio
                        </h3>

                        <p className="mt-1 text-xs text-zinc-600">
                          MP3 audio only
                        </p>
                      </div>

                      {media.formats.audio
                        .length > 0 && (
                        <span className="text-xs text-zinc-600">
                          {
                            media.formats.audio
                              .length
                          }{" "}
                          options
                        </span>
                      )}
                    </div>

                    <div className="mt-4 grid gap-3">
                      {media.formats.audio
                        .length > 0 ? (
                        media.formats.audio.map(
                          (format) => {
                            const isDownloading =
                              downloading ===
                              format.formatId;

                            const fileSize =
                              formatFileSize(
                                format.fileSize
                              );

                            return (
                              <button
                                key={
                                  format.formatId
                                }
                                type="button"
                                onClick={() =>
                                  handleDownload(
                                    format.formatId,
                                    "audio"
                                  )
                                }
                                disabled={
                                  downloading !==
                                  null
                                }
                                className="group flex w-full items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-4 text-left transition-colors hover:border-cyan-400/30 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <div className="min-w-0">
                                  <p className="font-medium">
                                    {
                                      format.quality
                                    }
                                  </p>

                                  <p className="mt-1 text-xs text-zinc-600">
                                    MP3
                                    {format.bitrate
                                      ? ` • ${Math.round(
                                          format.bitrate
                                        )} kbps`
                                      : ""}
                                    {fileSize
                                      ? ` • ${fileSize}`
                                      : ""}
                                  </p>
                                </div>

                                <span className="shrink-0 text-sm font-medium text-cyan-400">
                                  {isDownloading
                                    ? "Downloading..."
                                    : "Download"}
                                </span>
                              </button>
                            );
                          }
                        )
                      ) : (
                        <p className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-4 text-sm text-zinc-500">
                          No compatible audio
                          formats found.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Platforms */}
            <div
              id="platforms"
              className="mt-14"
            >
              <p className="mb-5 text-xs font-medium uppercase tracking-[0.2em] text-zinc-600">
                Popular platforms
              </p>

              <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-xs text-zinc-500 sm:gap-x-8 sm:text-sm">
                <span>YouTube</span>
                <span>TikTok</span>
                <span>Instagram</span>
                <span>Facebook</span>
                <span>X</span>
                <span>Reddit</span>
                <span>Vimeo</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        className="border-t border-white/10 bg-white/[0.02]"
      >
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24 lg:px-10">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium text-cyan-400">
              Simple process
            </p>

            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Three steps. That&apos;s it.
            </h2>

            <p className="mt-4 text-sm leading-6 text-zinc-500 sm:text-base">
              No complicated setup. Paste a
              link, choose what you want, and
              download it.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:mt-14 md:grid-cols-3 md:gap-5">
            <StepCard
              number="01"
              title="Paste the link"
              description="Copy a public video URL from a supported platform and paste it into SaveFlow."
            />

            <StepCard
              number="02"
              title="Choose your format"
              description="Select an available video quality or choose an audio-only format."
            />

            <StepCard
              number="03"
              title="Download"
              description="Process your media and download the file directly to your device."
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-8 text-center text-xs text-zinc-600 sm:px-8 md:flex-row md:items-center md:justify-between md:text-left lg:px-10">
          <p>
            © {new Date().getFullYear()}{" "}
            SaveFlow
          </p>

          <p>
            Built for permitted public media.
          </p>
        </div>
      </footer>
    </main>
  );
}

function sanitizeFileName(
  name: string
): string {
  const sanitized = name
    .replace(
      /[<>:"/\\|?*\x00-\x1F]/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);

  return sanitized || "saveflow-media";
}

function StepCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition-colors hover:bg-white/[0.04] sm:rounded-3xl sm:p-7">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-cyan-400">
          {number}
        </span>

        <span className="h-2 w-2 rounded-full bg-white/20" />
      </div>

      <h3 className="mt-8 text-xl font-semibold">
        {title}
      </h3>

      <p className="mt-3 text-sm leading-6 text-zinc-500">
        {description}
      </p>
    </article>
  );
}
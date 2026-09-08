import dotenv from "dotenv";

dotenv.config();

function getNumberEnv(
  value: string | undefined,
  fallback: number
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed;
}

export const env = {
  nodeEnv:
    process.env.NODE_ENV || "development",

  port: getNumberEnv(
    process.env.PORT,
    5000
  ),

  frontendUrls: (
    process.env.FRONTEND_URLS ||
    process.env.FRONTEND_URL ||
    "http://localhost:3000"
  )
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean),

  ffmpegPath:
    process.env.FFMPEG_PATH ||
    "C:\\Users\\HomePC\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-full_build\\bin",

  isProduction:
    process.env.NODE_ENV ===
    "production",
};
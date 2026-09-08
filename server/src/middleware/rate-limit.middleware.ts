import rateLimit from "express-rate-limit";

const rateLimitResponse = (
  message: string
) => ({
  success: false,
  message,
});

export const generalLimiter =
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitResponse(
      "Too many requests. Please try again later."
    ),
  });

export const analysisLimiter =
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitResponse(
      "Too many analysis requests. Please try again later."
    ),
  });

export const downloadLimiter =
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitResponse(
      "Too many download requests. Please try again later."
    ),
  });
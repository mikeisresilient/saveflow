import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import mediaRoutes from "./routes/media.routes.js";
import {
  cleanupOldTempFiles,
} from "./utils/temp-cleanup.utils.js";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 5000;

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(helmet());

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
  })
);

app.use(express.json({ limit: "1mb" }));

app.use(limiter);

app.use("/api/media", mediaRoutes);

app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "SaveFlow API is running",
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, async () => {
  console.log(
    `SaveFlow API running on http://localhost:${PORT}`
  );

  await cleanupOldTempFiles();
});